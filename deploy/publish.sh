#!/usr/bin/env bash
# Shared release switcher; requires Linux + Bash + flock.
set -euo pipefail
umask 022

fail() { printf '%s\n' "$*" >&2; exit 1; }
root=${1:?Missing deployment root}
action=${2:?Missing action}
release=${3:-}
[[ "$root" =~ ^/[A-Za-z0-9_./-]+$ && "$root" != / ]] || fail 'Invalid deployment root.'
[[ "/${root#/}/" != *'/../'* && "/${root#/}/" != *'/./'* && "$root" != *'//'* ]] || fail 'Invalid deployment root.'
[[ "$action" == prepare || "$action" == activate || "$action" == rollback ]] || fail 'Unknown action.'
if [[ "$action" != rollback ]]; then
  [[ "$release" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail 'Invalid release name.'
fi
[[ "$(uname -s)" == Linux ]] || fail 'The deployment server must run Linux.'
command -v flock >/dev/null || fail 'Missing server command: flock'

if [[ "$action" == prepare ]]; then mkdir -p -- "$root"; fi
cd -- "$root"
[[ ! -L releases ]] || fail 'releases must be a real directory.'
if [[ "$action" == prepare ]]; then mkdir -p -- releases; fi
[[ -d releases ]] || fail 'Missing releases directory.'
exec 9>.deploy.lock
flock -n 9 || fail 'Another deployment is switching versions. Retry shortly.'

# Refuse to replace unmanaged directories or links outside this release tree.
read_target() {
  local name=$1 target
  if [[ -L "$name" ]]; then
    target=$(readlink -- "$name")
    [[ "$target" =~ ^releases/[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail "Invalid $name link."
    [[ -d "$target" && ! -L "$target" ]] || fail "Missing or unsafe $name release."
    printf '%s' "$target"
  elif [[ -e "$name" ]]; then
    fail "$name exists and is not a symlink. Move the old site into releases before deploying."
  fi
}

old=$(read_target current)
previous=$(read_target previous)
if [[ "$action" == prepare ]]; then
  mkdir -- "releases/$release"
  printf '%s' "$old"
  exit 0
fi

if [[ "$action" == rollback ]]; then
  [[ -n "$old" && -n "$previous" && "$old" != "$previous" ]] || fail 'No previous release is available to roll back to.'
  target=$previous
else
  target="releases/$release"
fi
[[ -d "$target" && ! -L "$target" ]] || fail 'Missing or unsafe target release.'
for page in index.html 404.html search.json atom.xml sitemap.xml robots.txt; do
  [[ -f "$target/$page" && -s "$target/$page" && ! -L "$target/$page" ]] || fail "Incomplete release: $page"
done

current_tmp=".current-$$"
previous_tmp=".previous-$$"
trap 'rm -f -- "$current_tmp" "$previous_tmp"' EXIT
ln -s -- "$target" "$current_tmp"
if [[ -n "$old" ]]; then
  ln -s -- "$old" "$previous_tmp"
  mv -Tf -- "$previous_tmp" previous
fi
# GNU mv replaces the link itself in one rename, never the linked directory.
mv -Tf -- "$current_tmp" current
printf 'Active release: %s\n' "$target"
