import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pages = ['index.html', '404.html', 'search.json', 'atom.xml', 'sitemap.xml', 'robots.txt'];

// Git uses real local repositories. Only Linux detection, flock outcomes, and
// GNU mv's atomic rename are shimmed so the suite also runs on macOS. This does
// not exercise networking, kernel locks, or the systemd scheduler.
function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'blog-pull-test-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = join(temp, 'server');
  const remote = join(temp, 'remote.git');
  const author = join(temp, 'author');
  const bin = join(temp, 'bin');
  mkdirSync(bin);
  const env = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Deployment test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'Deployment test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
    BLOG_PUBLISH_SCRIPT: join(sourceRoot, 'deploy', 'publish.sh'),
  };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_PREFIX']) delete env[key];
  const mock = (name, body) => writeFileSync(join(bin, name), `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
  mock('uname', "process.stdout.write('Linux\\n');");
  mock('flock', "process.exit(process.env.PULL_TEST_BUSY_FD === process.argv.at(-1) ? 1 : 0);");
  mock('mv', `
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '-Tf' || args[1] !== '--') process.exit(95);
require('node:fs').renameSync(args[2], args[3]);
`);
  function git(args, cwd = temp) {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    assert.equal(result.status, 0, `git ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
    return result.stdout.trim();
  }
  git(['init', '--bare', '--initial-branch=site', remote]);
  git(['init', '--initial-branch=site', author]);
  git(['remote', 'add', 'origin', remote], author);
  function commit(version, missing = []) {
    for (const page of pages) {
      if (missing.includes(page)) rmSync(join(author, page), { force: true });
      else writeFileSync(join(author, page), `${version}: ${page}\n`);
    }
    git(['add', '-A'], author);
    git(['commit', '-m', version], author);
    git(['push', 'origin', 'site'], author);
    return git(['rev-parse', 'HEAD'], author);
  }
  const run = (extraEnv = {}) => spawnSync('/bin/bash', [join(sourceRoot, 'deploy', 'pull.sh'), root, remote, 'site'], {
    cwd: temp, env: { ...env, ...extraEnv }, encoding: 'utf8',
  });
  const current = () => readlinkSync(join(root, 'current'));
  const revision = () => readFileSync(join(root, 'current', '.git-revision'), 'utf8').trim();
  const releases = () => readdirSync(join(root, 'releases'));
  const firstRevision = commit('first');
  return { temp, root, remote, author, env, git, commit, run, current, revision, releases, firstRevision };
}

function succeeds(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

test('first pull publishes and an unchanged remote creates no new release', t => {
  const f = fixture(t);
  succeeds(f.run());
  assert.equal(f.revision(), f.firstRevision);
  assert.equal(statSync(join(f.root, 'current')).mode & 0o777, 0o755);
  assert.equal(statSync(join(f.root, 'current', 'index.html')).mode & 0o777, 0o644);
  assert.equal(readFileSync(join(f.root, 'current', 'index.html'), 'utf8'), 'first: index.html\n');
  assert.equal(existsSync(join(f.root, 'current', '.git')), false);
  const first = f.current();
  const result = f.run();
  succeeds(result);
  assert.match(result.stdout, /No site update:/);
  assert.equal(f.current(), first);
  assert.equal(f.releases().length, 1);
  assert.equal(existsSync(join(f.root, 'previous')), false);
});

test('a new remote commit publishes and keeps the preceding version', t => {
  const f = fixture(t);
  succeeds(f.run());
  const first = f.current();
  const secondRevision = f.commit('second');
  succeeds(f.run());
  assert.notEqual(f.current(), first);
  assert.equal(f.revision(), secondRevision);
  assert.equal(readlinkSync(join(f.root, 'previous')), first);
  assert.equal(f.releases().length, 2);
});

test('a failed pull keeps the live site and succeeds once the remote returns', t => {
  const f = fixture(t);
  succeeds(f.run());
  const first = f.current();
  const secondRevision = f.commit('second');
  renameSync(f.remote, `${f.remote}.offline`);
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.equal(f.current(), first);
  assert.equal(f.releases().length, 1);
  renameSync(`${f.remote}.offline`, f.remote);
  succeeds(f.run());
  assert.equal(f.revision(), secondRevision);
});

test('publication failure is retried even when pull already advanced the checkout', t => {
  const f = fixture(t);
  succeeds(f.run());
  const first = f.current();
  const secondRevision = f.commit('second');
  const brokenPublisher = join(f.temp, 'broken-publish.sh');
  writeFileSync(brokenPublisher, '#!/usr/bin/env bash\nexit 42\n');
  const result = f.run({ BLOG_PUBLISH_SCRIPT: brokenPublisher });
  assert.equal(result.status, 42);
  assert.equal(f.current(), first);
  assert.equal(f.revision(), f.firstRevision);
  assert.equal(f.git(['rev-parse', 'HEAD'], join(f.root, '.site-repo')), secondRevision);
  assert.equal(f.releases().length, 1);
  succeeds(f.run());
  assert.equal(f.revision(), secondRevision);
  assert.equal(f.releases().length, 2);
});

test('cleanup preserves a published release retained by rollback as previous', t => {
  const f = fixture(t);
  succeeds(f.run());
  const first = f.current();
  const secondRevision = f.commit('second');
  const interruptedPublisher = join(f.temp, 'interrupted-publish.sh');
  writeFileSync(interruptedPublisher, `#!/usr/bin/env bash
set -e
bash "$BLOG_REAL_PUBLISH_SCRIPT" "$@"
bash "$BLOG_REAL_PUBLISH_SCRIPT" "$1" rollback
exit 42
`);
  const result = f.run({ BLOG_PUBLISH_SCRIPT: interruptedPublisher, BLOG_REAL_PUBLISH_SCRIPT: f.env.BLOG_PUBLISH_SCRIPT });
  assert.equal(result.status, 42);
  assert.equal(f.current(), first);
  assert.equal(readFileSync(join(f.root, 'previous', '.git-revision'), 'utf8').trim(), secondRevision);
  assert.equal(f.releases().length, 2);
});

test('a dirty site checkout is refused without overwriting changes', t => {
  const f = fixture(t);
  succeeds(f.run());
  const first = f.current();
  f.commit('second');
  const localFile = join(f.root, '.site-repo', 'index.html');
  writeFileSync(localFile, 'local edit');
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /local changes/);
  assert.equal(readFileSync(localFile, 'utf8'), 'local edit');
  assert.equal(f.current(), first);
  assert.equal(f.releases().length, 1);
});

test('an incomplete remote site leaves the old site live until a valid commit arrives', t => {
  const f = fixture(t);
  succeeds(f.run());
  const first = f.current();
  f.commit('incomplete', ['sitemap.xml']);
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Incomplete release: sitemap.xml/);
  assert.equal(f.current(), first);
  assert.equal(f.releases().length, 1);
  const repaired = f.commit('repaired');
  succeeds(f.run());
  assert.equal(f.revision(), repaired);
});

test('a competing pull lock prevents clone and publication', t => {
  const f = fixture(t);
  const result = f.run({ PULL_TEST_BUSY_FD: '8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Another pull is running/);
  assert.equal(existsSync(join(f.root, '.site-repo')), false);
  assert.equal(existsSync(join(f.root, 'current')), false);
});

test('a busy publish lock preserves the site and allows a later retry', t => {
  const f = fixture(t);
  succeeds(f.run());
  const first = f.current();
  const secondRevision = f.commit('second');
  const result = f.run({ PULL_TEST_BUSY_FD: '9' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Another deployment is switching versions/);
  assert.equal(f.current(), first);
  assert.equal(f.releases().length, 1);
  succeeds(f.run());
  assert.equal(f.revision(), secondRevision);
});
