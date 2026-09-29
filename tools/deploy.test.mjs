import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { deploy, readConfig } from './deploy.mjs';

const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pages = ['index.html', '404.html', 'search.json', 'atom.xml', 'sitemap.xml', 'robots.txt'];

// All commands are isolated in a temporary directory. SSH executes the actual
// publish.sh locally; rsync copies files without a network connection. On macOS,
// uname/flock/mv shims model Linux, lock outcomes, and GNU mv's rename behavior.
// This tests orchestration and release handling, not SSH, hard links, or flock.
function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'blog-deploy-test-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const projectRoot = join(temp, 'project');
  const root = join(temp, 'server');
  const bin = join(temp, 'bin');
  const log = join(temp, 'commands.jsonl');
  mkdirSync(join(projectRoot, 'deploy'), { recursive: true });
  mkdirSync(bin);
  writeFileSync(log, '');
  copyFileSync(join(sourceRoot, 'deploy', 'publish.sh'), join(projectRoot, 'deploy', 'publish.sh'));
  const common = `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify({command: path.basename(process.argv[1]), args}) + '\\n');
`;
  function mock(name, body) {
    writeFileSync(join(bin, name), `#!${process.execPath}\n${common}\n${body}\n`, { mode: 0o755 });
  }
  mock('pnpm', `
if (JSON.stringify(args) !== '["run","build"]') process.exit(91);
if (process.env.MOCK_BUILD_FAIL) process.exit(7);
fs.mkdirSync('public', {recursive: true});
for (const page of ${JSON.stringify(pages)}) {
  if (page !== process.env.MOCK_MISSING_PAGE) fs.writeFileSync(path.join('public', page), process.env.MOCK_VERSION || 'first');
}
if (process.env.MOCK_PUBLIC_SYMLINK) fs.symlinkSync('../deploy/publish.sh', 'public/unsafe');
`);
  mock('ssh', `
if (args.at(-2) !== 'test-server' || !args.at(-1).startsWith('bash -s -- ')) process.exit(92);
const result = require('node:child_process').spawnSync('/bin/bash', ['-c', args.at(-1)], {
  input: fs.readFileSync(0), env: process.env, encoding: 'utf8',
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 93);
`);
  mock('rsync', `
if (process.env.MOCK_UPLOAD_FAIL) process.exit(8);
const destination = args.at(-1);
if (!destination.startsWith('test-server:' + process.env.DEPLOY_PATH + '/releases/')) process.exit(94);
fs.cpSync(args.at(-2), destination.slice('test-server:'.length), {recursive: true});
`);
  mock('uname', "process.stdout.write('Linux\\n');");
  mock('flock', 'process.exit(process.env.MOCK_LOCK_BUSY ? 1 : 0);');
  mock('mv', `
if (args[0] !== '-Tf' || args[1] !== '--' || args.length !== 4) process.exit(95);
fs.renameSync(args[2], args[3]);
`);
  const env = {
    PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
    DEPLOY_HOST: 'test-server', DEPLOY_PATH: root, MOCK_LOG: log,
  };
  const commands = () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const actions = () => commands().filter(item => item.command === 'ssh').map(item => item.args.at(-1).match(/'(prepare|activate|rollback)'/)[1]);
  const run = (extraEnv = {}, args = []) => deploy({ projectRoot, args, env: { ...env, ...extraEnv } });
  return { projectRoot, root, env, log, commands, actions, run };
}

test('configuration requires a safe host, absolute release root, valid port, and existing key', t => {
  const { projectRoot, env } = fixture(t);
  assert.throws(() => readConfig(projectRoot, {}), /DEPLOY_HOST/);
  for (const host of ['-oProxyCommand=bad', 'user@host;bad', 'host name']) {
    assert.throws(() => readConfig(projectRoot, { ...env, DEPLOY_HOST: host }), /DEPLOY_HOST/);
  }
  for (const root of ['/', '/tmp/../site', '/tmp/./site', '/tmp//site', 'relative', '/tmp/site name']) {
    assert.throws(() => readConfig(projectRoot, { ...env, DEPLOY_PATH: root }), /DEPLOY_PATH/);
  }
  for (const port of ['0', '65536', '22;bad', '-1']) {
    assert.throws(() => readConfig(projectRoot, { ...env, DEPLOY_SSH_PORT: port }), /DEPLOY_SSH_PORT/);
  }
  assert.throws(() => readConfig(projectRoot, { ...env, DEPLOY_SSH_KEY: 'missing-key' }), /SSH/);
  for (const key of ["key'file", 'key"file', 'key\x00file', 'key\nfile', 'key\tfile', 'key\x7ffile']) {
    assert.throws(() => readConfig(projectRoot, { ...env, DEPLOY_SSH_KEY: key }), /路径不能含引号或控制字符/);
  }
  writeFileSync(join(projectRoot, '.env.deploy.local'), 'DEPLOY_HOST=file-host\nDEPLOY_PATH=/srv/file-site\nDEPLOY_SSH_PORT=2222\nDEPLOY_SSH_KEY=test-key\n');
  writeFileSync(join(projectRoot, 'test-key'), 'fake key');
  const config = readConfig(projectRoot, { DEPLOY_HOST: 'override-host', DEPLOY_PATH: '/srv/site/' });
  assert.equal(config.host, 'override-host');
  assert.equal(config.root, '/srv/site');
  assert.deepEqual(config.sshOptions.slice(-4), ['-p', '2222', '-i', join(projectRoot, 'test-key')]);
});

test('dry-run starts no commands for deploy or rollback', async t => {
  const f = fixture(t);
  rmSync(join(f.projectRoot, 'deploy', 'publish.sh'));
  await f.run({}, ['--dry-run']);
  await f.run({}, ['--rollback', '--dry-run']);
  await f.run({}, ['--', '--dry-run']);
  await f.run({}, ['--', '--rollback', '--dry-run']);
  assert.deepEqual(f.commands(), []);
  assert.equal(existsSync(join(f.projectRoot, 'public')), false);
  assert.equal(existsSync(f.root), false);
});

test('build failure prevents all remote commands', async t => {
  const f = fixture(t);
  await assert.rejects(f.run({ MOCK_BUILD_FAIL: '1' }), /pnpm/);
  assert.deepEqual(f.commands().map(item => item.command), ['pnpm']);
  assert.equal(existsSync(f.root), false);
});

test('incomplete build and public symlinks are rejected before connecting', async t => {
  const missing = fixture(t);
  await assert.rejects(missing.run({ MOCK_MISSING_PAGE: 'sitemap.xml' }), /sitemap.xml/);
  assert.deepEqual(missing.actions(), []);
  const unsafe = fixture(t);
  await assert.rejects(unsafe.run({ MOCK_PUBLIC_SYMLINK: '1' }), /符号链接/);
  assert.deepEqual(unsafe.actions(), []);
});

test('upload failure leaves the active release untouched and never activates', async t => {
  const f = fixture(t);
  await f.run();
  const current = readlinkSync(join(f.root, 'current'));
  writeFileSync(f.log, '');
  await assert.rejects(f.run({ MOCK_UPLOAD_FAIL: '1', MOCK_VERSION: 'second' }), /rsync/);
  assert.deepEqual(f.actions(), ['prepare']);
  assert.equal(readlinkSync(join(f.root, 'current')), current);
  assert.equal(readFileSync(join(f.root, 'current', 'index.html'), 'utf8'), 'first');
  assert.equal(existsSync(join(f.root, 'previous')), false);
});

test('two releases preserve previous and rollback exchanges the versions without building or uploading', async t => {
  const f = fixture(t);
  await f.run();
  const first = readlinkSync(join(f.root, 'current'));
  assert.equal(existsSync(join(f.root, 'previous')), false);
  await f.run({ MOCK_VERSION: 'second' });
  const second = readlinkSync(join(f.root, 'current'));
  assert.notEqual(first, second);
  assert.equal(readlinkSync(join(f.root, 'previous')), first);
  assert.equal(readFileSync(join(f.root, 'current', 'index.html'), 'utf8'), 'second');
  const uploads = f.commands().filter(item => item.command === 'rsync');
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].args.some(arg => arg.startsWith('--link-dest=')), false);
  assert.ok(uploads[1].args.includes(`--link-dest=${f.root}/${first}`));
  writeFileSync(f.log, '');
  await f.run({}, ['--rollback']);
  assert.equal(readlinkSync(join(f.root, 'current')), first);
  assert.equal(readlinkSync(join(f.root, 'previous')), second);
  assert.equal(readFileSync(join(f.root, 'current', 'index.html'), 'utf8'), 'first');
  await f.run({}, ['--rollback']);
  assert.equal(readlinkSync(join(f.root, 'current')), second);
  assert.deepEqual(f.actions(), ['rollback', 'rollback']);
  assert.equal(f.commands().some(item => ['pnpm', 'rsync'].includes(item.command)), false);
});

test('a real current directory is refused without replacing its contents', async t => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'current'), { recursive: true });
  writeFileSync(join(f.root, 'current', 'index.html'), 'existing website');
  await assert.rejects(f.run(), /ssh/);
  assert.deepEqual(f.actions(), ['prepare']);
  assert.equal(f.commands().some(item => item.command === 'rsync'), false);
  assert.equal(readFileSync(join(f.root, 'current', 'index.html'), 'utf8'), 'existing website');
});

test('lock conflict refuses rollback and preserves both links', async t => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'releases', 'first'), { recursive: true });
  mkdirSync(join(f.root, 'releases', 'second'));
  symlinkSync('releases/second', join(f.root, 'current'));
  symlinkSync('releases/first', join(f.root, 'previous'));
  await assert.rejects(f.run({ MOCK_LOCK_BUSY: '1' }, ['--rollback']), /ssh/);
  assert.equal(readlinkSync(join(f.root, 'current')), 'releases/second');
  assert.equal(readlinkSync(join(f.root, 'previous')), 'releases/first');
  assert.equal(f.commands().some(item => item.command === 'mv'), false);
});
