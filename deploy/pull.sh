#!/usr/bin/env bash
# Pull the prebuilt site branch and publish a new immutable release on Linux.
set -euo pipefail
umask 022

fail() { printf '%s\n' "$*" >&2; exit 1; }
root=${1:-/var/www/blog}
repo=${2:-https://github.com/recode2025/blog.git}
branch=${3:-site}
publisher=${BLOG_PUBLISH_SCRIPT:-/usr/local/lib/blog/publish.sh}
[[ $# -le 3 ]] || fail 'Usage: blog-pull [deployment-root [repository [branch]]]'
[[ "$root" =~ ^/[A-Za-z0-9_./-]+$ && "$root" != / ]] || fail 'Invalid deployment root.'
[[ "/${root#/}/" != *'/../'* && "/${root#/}/" != *'/./'* && "$root" != *'//'* ]] || fail 'Invalid deployment root.'
[[ -n "$repo" && "$repo" != -* && "$repo" != *$'\n'* && "$repo" != *$'\r'* ]] || fail 'Invalid repository.'
[[ "$branch" =~ ^[A-Za-z0-9][A-Za-z0-9/._-]*$ ]] || fail 'Invalid branch.'
[[ "$(uname -s)" == Linux ]] || fail 'The deployment server must run Linux.'
for tool in git flock tar mktemp; do command -v "$tool" >/dev/null || fail "Missing server command: $tool"; done
[[ -f "$publisher" ]] || fail "Missing publish helper: $publisher"

# Do not inherit a calling Git hook's working tree or index settings.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_PREFIX
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes -o ConnectTimeout=20}"
git check-ref-format --branch "$branch" >/dev/null || fail 'Invalid branch.'
mkdir -p -- "$root"
cd -- "$root"
exec 8>.pull.lock
flock -n 8 || fail 'Another pull is running. Retry shortly.'

[[ ! -L .site-repo ]] || fail '.site-repo must be a real directory.'
[[ ! -L releases ]] || fail 'releases must be a real directory.'
mkdir -p -- releases
if [[ -L current ]]; then
  current_target=$(readlink -- current)
  [[ "$current_target" =~ ^releases/[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail 'Invalid current link.'
  [[ -d "$current_target" && ! -L "$current_target" ]] || fail 'Missing or unsafe current release.'
elif [[ -e current ]]; then
  fail 'current exists and is not a symlink. Move the old site into releases before deploying.'
fi

checkout="$root/.site-repo"
if [[ ! -e "$checkout" ]]; then
  git clone --single-branch --branch "$branch" -- "$repo" "$checkout"
fi
[[ -d "$checkout/.git" && ! -L "$checkout/.git" ]] || fail 'Invalid site checkout.'
[[ "$(git -C "$checkout" config --get remote.origin.url)" == "$repo" ]] || fail 'Site checkout uses a different repository.'
[[ "$(git -C "$checkout" symbolic-ref --short HEAD)" == "$branch" ]] || fail 'Site checkout uses a different branch.'
[[ -z "$(git -C "$checkout" status --porcelain --untracked-files=all)" ]] || fail 'Site checkout has local changes; refusing to pull.'
git -C "$checkout" pull --ff-only origin "$branch"
[[ -z "$(git -C "$checkout" status --porcelain --untracked-files=all)" ]] || fail 'Site checkout has local changes after pull.'
revision=$(git -C "$checkout" rev-parse --verify 'HEAD^{commit}')
remote_revision=$(git -C "$checkout" rev-parse --verify "refs/remotes/origin/$branch^{commit}")
[[ "$revision" == "$remote_revision" ]] || fail 'Site checkout has unpublished commits; refusing to publish.'

# Compare with the live release, not the checkout. A failed publication must be
# retried even when the preceding pull already advanced the checkout's HEAD.
if [[ -f current/.git-revision && ! -L current/.git-revision && "$(cat current/.git-revision)" == "$revision" ]]; then
  printf 'No site update: %s\n' "$revision"
  exit 0
fi

release_dir=$(mktemp -d "$root/releases/$(date -u +%Y%m%dT%H%M%SZ)-${revision:0:12}-XXXXXX")
release=${release_dir##*/}
published=0
cleanup() {
  # A helper failure after switching or a concurrent rollback must never remove
  # either version referenced by the live/previous links.
  if [[ "$published" == 0 && "$(readlink -- "$root/current" 2>/dev/null || true)" != "releases/$release" && "$(readlink -- "$root/previous" 2>/dev/null || true)" != "releases/$release" ]]; then
    rm -rf -- "$release_dir"
  fi
}
trap cleanup EXIT
chmod 755 "$release_dir"
git -C "$checkout" archive --format=tar "$revision" | tar -xf - -C "$release_dir"
[[ -z "$(find "$release_dir" -type l -print -quit)" ]] || fail 'Site files must not contain symlinks.'
for page in index.html 404.html search.json atom.xml sitemap.xml robots.txt; do
  [[ -f "$release_dir/$page" && -s "$release_dir/$page" && ! -L "$release_dir/$page" ]] || fail "Incomplete release: $page"
done
printf '%s\n' "$revision" > "$release_dir/.git-revision"
bash "$publisher" "$root" activate "$release"
published=1
printf 'Published site commit: %s\n' "$revision"
