#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { lstat, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_FILES = ['index.html', '404.html', 'search.json', 'atom.xml', 'sitemap.xml', 'robots.txt'];
const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

export function readConfig(projectRoot, environment = process.env) {
  const file = join(projectRoot, '.env.deploy.local');
  const env = { ...(existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}), ...environment };
  const host = env.DEPLOY_HOST || '';
  const root = (env.DEPLOY_PATH || '').replace(/\/+$/, '');
  if (!host || !root) {
    throw new Error('先复制 .env.deploy.example 为 .env.deploy.local，填写 DEPLOY_HOST 和 DEPLOY_PATH。');
  }
  // An SSH alias also supports IPv6 hosts and other options via ~/.ssh/config.
  if (!/^(?:[A-Za-z0-9_][A-Za-z0-9_.-]*@)?[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(host)) {
    throw new Error('DEPLOY_HOST 需为 SSH 主机别名或 user@hostname；IPv6 请使用 SSH 别名。');
  }
  if (!/^\/[A-Za-z0-9_./-]+$/.test(root) || root.split('/').some(part => part === '.' || part === '..') || root.includes('//')) {
    throw new Error('DEPLOY_PATH 需为绝对目录，不能是 /，不能包含空格、. 或 .. 路径段。');
  }
  const sshOptions = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15'];
  if (env.DEPLOY_SSH_PORT) {
    if (!/^\d+$/.test(env.DEPLOY_SSH_PORT) || Number(env.DEPLOY_SSH_PORT) < 1 || Number(env.DEPLOY_SSH_PORT) > 65535) {
      throw new Error('DEPLOY_SSH_PORT 需为 1–65535 之间的端口。');
    }
    sshOptions.push('-p', env.DEPLOY_SSH_PORT);
  }
  if (env.DEPLOY_SSH_KEY) {
    const key = env.DEPLOY_SSH_KEY.startsWith('~/')
      ? join(homedir(), env.DEPLOY_SSH_KEY.slice(2))
      : resolve(projectRoot, env.DEPLOY_SSH_KEY);
    if (/["'\x00-\x1f\x7f]/.test(key)) {
      throw new Error('DEPLOY_SSH_KEY 路径不能含引号或控制字符；这种路径请改在 SSH 别名中配置。');
    }
    if (!existsSync(key)) throw new Error(`找不到 SSH 私钥文件：${key}`);
    sshOptions.push('-i', key);
  }
  return { host, root, sshOptions };
}

function run(command, args, { cwd, input, capture = false, env = process.env } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, {
      cwd, env,
      stdio: [input === undefined ? 'inherit' : 'pipe', capture ? 'pipe' : 'inherit', 'inherit'],
    });
    let output = '';
    if (capture) child.stdout.on('data', chunk => { output += chunk; });
    child.on('error', error => reject(new Error(`无法运行 ${command}：${error.message}`)));
    child.on('close', (code, signal) => {
      if (code === 0) accept(output.trim());
      else reject(new Error(`${command} 执行失败（${signal || code}）。`));
    });
    if (input !== undefined) {
      child.stdin.on('error', () => {}); // Spawn/exit errors are reported above.
      child.stdin.end(input);
    }
  });
}

async function verifyPublic(directory) {
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('public 不能是符号链接。');
  for (const name of REQUIRED_FILES) {
    const info = await stat(join(directory, name));
    if (!info.isFile() || !info.size) throw new Error(`构建结果缺少有效的 ${name}。`);
  }
  async function inspect(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`构建目录含符号链接，停止上传：${join(path, entry.name)}`);
      if (entry.isDirectory()) await inspect(join(path, entry.name));
    }
  }
  await inspect(directory);
}

export async function deploy({ projectRoot = PROJECT_ROOT, args = process.argv.slice(2), env = process.env } = {}) {
  if (args[0] === '--') args = args.slice(1); // pnpm forwards the separator.
  if (args.some(arg => !['--help', '--dry-run', '--rollback'].includes(arg))) {
    throw new Error('支持的参数：--help、--dry-run、--rollback。');
  }
  if (args.includes('--help')) {
    console.log('首次配置：复制 .env.deploy.example 为 .env.deploy.local，填写 SSH 地址与部署目录。\n发布：pnpm run deploy\n预览计划（不构建、不连接服务器）：pnpm run deploy -- --dry-run\n回滚：pnpm run deploy:rollback\n详细说明：docs/deployment.md');
    return;
  }
  const config = readConfig(projectRoot, env);
  const rollback = args.includes('--rollback');
  console.log(`目标：${config.host}:${config.root}/current`);
  if (args.includes('--dry-run')) {
    console.log(rollback
      ? '计划：连接服务器，在锁保护下交换 current 和 previous。'
      : '计划：pnpm run build → 检查 public → rsync 上传新版本（复用上一版文件）→ 原子切换 current。');
    return;
  }
  const remoteScript = readFileSync(join(projectRoot, 'deploy', 'publish.sh'), 'utf8');
  const remote = (action, release = '', capture = false) => run('ssh', [
    ...config.sshOptions, config.host,
    `bash -s -- ${[config.root, action, release].map(quote).join(' ')}`,
  ], { cwd: projectRoot, input: remoteScript, capture, env });

  if (rollback) {
    await remote('rollback');
    console.log('回滚完成。再次运行回滚命令可切回刚才的版本。');
    return;
  }
  console.log('1/3 构建并检查静态文件');
  await run('pnpm', ['run', 'build'], { cwd: projectRoot, env });
  const directory = join(projectRoot, 'public');
  await verifyPublic(directory);
  const release = `${new Date().toISOString().replace(/[-:.]/g, '')}-${randomBytes(4).toString('hex')}`;
  const previous = await remote('prepare', release, true);
  if (previous && !/^releases\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(previous)) {
    throw new Error('服务器返回了无法识别的版本路径，停止上传。请检查 SSH 登录脚本是否向 stdout 输出了额外内容。');
  }
  console.log('2/3 上传新版本');
  await run('rsync', [
    '-rltpz', '--checksum', '--stats',
    '--chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r', '--exclude=.DS_Store',
    ...(previous ? [`--link-dest=${config.root}/${previous}`] : []),
    '-e', ['ssh', ...config.sshOptions].map(quote).join(' '),
    `${directory}/`, `${config.host}:${config.root}/releases/${release}/`,
  ], { cwd: projectRoot, env });
  console.log('3/3 切换线上版本');
  try {
    await remote('activate', release);
  } catch (error) {
    throw new Error(`${error.message} 旧版本仍保留；若切换时连接中断，请检查服务器 current 的实际指向。`);
  }
  console.log(`发布完成：${release}\n回滚命令：pnpm run deploy:rollback`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  deploy().catch(error => { console.error(error.message); process.exitCode = 1; });
}
