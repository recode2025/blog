# 服务器准备与本地手动发布

默认更新方式为 [Git 更新与每天中午自动发布](git-deployment.md)。源码推送到 GitHub 的 `main` 后，Actions 构建并更新 `site` 分支，服务器每天北京时间 12:00 拉取，有变化时切换线上版本。定时任务的首次安装、运行检查和手动触发请按该文档执行。本文保留 Nginx 配置、版本管理和可选的本地手动发布步骤。

可选的本地手动方式是在电脑上执行 `pnpm run deploy`。脚本会构建 Hexo、检查生成文件、通过 SSH + rsync 上传新版本，最后原子切换服务器上的 `current` 链接。两种方式都由 Nginx 直接提供静态文件，服务器无需安装 Node.js 或 pnpm。

脚本只管理博客静态文件。已有的 Artalk 评论服务、数据库、域名和证书继续独立维护。

## 首次准备服务器

服务器需为 Linux。每日 Git 拉取方式需要 Bash、Git、tar 和 flock，Ubuntu 通常已内置其中除 Git 外的工具；先检查实际缺少的命令，按 [定时拉取安装说明](git-deployment.md) 配置。该方式无需 rsync，也无需专门升级 `util-linux`。

准备一个 SSH 用户有写权限的部署目录。以下假设已有用户名和用户组 `deploy`，请替换成自己的实际用户和组：

```sh
sudo install -d -o deploy -g deploy -m 755 /var/www/blog /var/www/blog/releases
```

发布账号必须对该目录有写权限，Nginx 的运行用户需要读取目录和文件。公开仓库的每日拉取通过 HTTPS 完成，无需配置服务器供 GitHub 登录的密钥。

## 可选的本地手动连接

仅使用 `pnpm run deploy` 上传时，电脑和服务器还需要 rsync，发布账号也需要 SSH 密钥或 SSH agent 登录。服务器缺少 rsync 时，在软件源恢复正常后执行 `sudo apt-get install rsync`。本地脚本使用 `BatchMode=yes`，不会交互输入密码，也不会绕过服务器指纹校验。

可以在电脑的 `~/.ssh/config` 中配置别名，将示例地址和用户名换成真实值：

```sshconfig
Host blog-server
    HostName YOUR_SERVER_IP
    User deploy
    Port 22
    IdentityFile ~/.ssh/id_ed25519
```

先手动执行 `ssh blog-server`，核对服务器指纹并确认能登录。然后在项目目录首次创建配置：

```sh
cp .env.deploy.example .env.deploy.local
```

编辑 `.env.deploy.local`：

```dotenv
DEPLOY_HOST=blog-server
DEPLOY_PATH=/var/www/blog
```

也可直接把 `DEPLOY_HOST` 写成 `用户名@服务器地址`。可选的 `DEPLOY_SSH_PORT` 和 `DEPLOY_SSH_KEY` 用于覆盖 SSH 配置；IPv6 地址请通过 SSH 别名配置。部署目录必须是绝对路径，不能包含空格或 `.`、`..` 路径段。现有环境变量优先于本地配置文件。

`.env.deploy.local` 已加入 Git 忽略。配置文件只填写连接信息和密钥文件路径，不要粘贴私钥内容。部署只上传生成的 `public/`，不会上传这些配置或项目源码。

## 本地手动首次发布

本地需要 Node.js 20.19 或以上版本以及 pnpm、SSH、rsync。可以继续使用本项目当前使用的 Node.js 24。首次拉取项目时先准备主题和依赖：

```sh
git submodule update --init --recursive
pnpm install --frozen-lockfile
```

先预览计划，再发布：

```sh
pnpm run deploy -- --dry-run
pnpm run deploy
```

`--dry-run` 只校验本地配置并显示计划，不构建、不连接服务器，也不检查远端权限。真实发布过程中，SSH 连接、上传或切换失败都会返回非零退出码。

## Nginx 与 HTTPS

通过 Git 拉取或本地上传完成首次发布后，使用完整站点配置 [www.recode88.cn.conf](../deploy/nginx/www.recode88.cn.conf)。放到服务器 `/etc/nginx/conf.d/www.recode88.cn.conf`，替换原来这两个域名的站点配置，避免重复 `server_name`。该文件需由主配置在 `http` 块中包含。

配置在 IPv4 和 IPv6 上采用相同规则，并保留请求路径和查询参数：

| 访问地址 | 行为 |
| --- | --- |
| `http://recode88.cn` | 301 跳转到 `https://www.recode88.cn` |
| `http://www.recode88.cn` | 301 跳转到 `https://www.recode88.cn` |
| `https://recode88.cn` | 301 跳转到 `https://www.recode88.cn` |
| `https://www.recode88.cn` | 从 `/var/www/blog/current` 提供博客内容 |

两个域名的 A 和 AAAA 记录分别指向服务器可用的公网 IPv4 和 IPv6，云安全组及服务器防火墙均放通这两种地址的 TCP 80、443。仅添加 IPv6 监听不能代替服务器网络和 DNS 配置。

两个 HTTPS 块使用同一张同时覆盖 `www.recode88.cn` 和 `recode88.cn` 的证书。示例路径为 `/etc/letsencrypt/live/www.recode88.cn/`；使用其他证书管理方式时，修改两个块中的证书路径。

首次尚无证书时，只启用文件中的第一个 HTTP `server` 块，暂时不要加载两个 HTTPS 块。安装好 Certbot 后，创建验证目录，测试并重载这个 HTTP 配置，再签发证书：

```sh
sudo mkdir -p /var/www/letsencrypt
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/letsencrypt \
  --cert-name www.recode88.cn -d www.recode88.cn -d recode88.cn
```

HTTP 的 `/.well-known/acme-challenge/` 专门用于签发与续期验证，该路径直接提供验证文件，其余 HTTP 请求跳转到 HTTPS。拿到证书后再启用完整配置，并检查、重载：

```sh
sudo nginx -t && sudo systemctl reload nginx
```

日常发布只切换链接，不需要重载 Nginx。配置显式关闭这个站点的 `open_file_cache`，确保能及时读取切换后的版本。Certbot 需启用自动续期，并配置成功续期后重载 Nginx 的 deploy hook。

首次上线后检查首页、文章、搜索、`/atom.xml`、`/sitemap.xml` 和不存在的地址。Artalk 还需独立验证提交评论和刷新读取，相关反向代理见 `deploy/nginx/comments.recode88.cn.conf`。

## 本地手动更新

默认按 [Git 更新流程](git-deployment.md#5-日常更新和立即发布) 提交和推送，等待服务器每日拉取。需要临时从电脑直接上传时，修改文章或样式后执行：

```sh
pnpm run deploy
```

它会依次执行：

1. 运行现有 `pnpm run build`，检查首页、404、搜索索引、订阅、站点地图及 robots 文件。
2. 在服务器创建唯一的 `releases/<时间戳-随机串>` 目录。
3. 使用 rsync 校验文件内容，并以先前版本作为 `--link-dest` 基准，减少重复文件的网络传输。首次发布需要完整上传；校验内容会增加本地和服务器的磁盘读取。
4. 上传成功后再次检查关键文件，在文件锁保护下切换 `current`，把原版本记为 `previous`。

构建或上传失败不会切换线上版本。切换期间若 SSH 断开，链接可能已经切换成功，应登录查看 `readlink /var/www/blog/current` 再决定是否重试。不要同时从同一个本地项目目录启动多个构建或发布；来自不同电脑的发布会分别上传，最后完成切换的版本生效。

普通发布使用现有 About 数据快照。需要刷新公开数据时，先运行 `pnpm run sync:about`；需要读取本地鸣潮凭据时使用 `pnpm run sync:about:local`，然后执行发布。

## 回滚与版本管理

使用每日 Git 拉取时，在服务器执行：

```sh
sudo systemctl stop blog-pull.timer
sudo systemctl stop blog-pull.service
sudo -u deploy bash /usr/local/lib/blog/publish.sh /var/www/blog rollback
```

先停止定时器和拉取服务，可避免下一次自动更新立即重新发布 `site` 的最新版本。需要跨重启暂停时执行 `sudo systemctl disable --now blog-pull.timer`。修复源码并完成 Actions 构建后，再执行 `sudo systemctl enable --now blog-pull.timer` 恢复计划。

使用本地 SSH 连接方式时，也可在电脑上执行 `pnpm run deploy:rollback`。两种回滚方式都只交换 `current` 和 `previous`，不构建、不重新上传。再运行一次可切回刚才的版本。首次发布没有上一版，回滚会明确报错。

服务器目录结构示例：

```text
/var/www/blog/
├── .site-repo/  # 每日拉取使用的 Git 检出，不在网站根目录内
├── releases/
│   ├── 20260929T080000000Z-a1b2c3d4/
│   └── 20260930T080000000Z-e5f6a7b8/
├── current -> releases/20260930T080000000Z-e5f6a7b8/
└── previous -> releases/20260929T080000000Z-a1b2c3d4/
```

脚本不会自动删除历史版本，上传中断的目录也会保留。定期检查磁盘空间，确认没有发布正在执行，再清理不被 `current` 或 `previous` 引用的旧目录。不要直接编辑已发布目录中的文件；部分文件可能与旧版本共享硬链接。更新内容始终通过新版本发布。

若已有 `current` 是真实目录，或链接指向 `releases/` 之外，脚本会拒绝覆盖。迁移时先备份现有站点，再准备新的部署目录并调整 Nginx。脚本不会替你迁移或删除旧站。

## 常见问题

- `Permission denied (publickey)`：先确认 `ssh blog-server` 能用密钥登录，必要时配置 SSH agent 或 `DEPLOY_SSH_KEY`。
- 无法创建目录或文件：检查 SSH 用户对 `DEPLOY_PATH` 的写权限，无需为日常发布使用 root。
- `Missing server command`：安装脚本提示的缺失命令；rsync 仅用于本地手动上传。
- `Another deployment is switching versions`：另一个发布或回滚正在切换，稍后重试；锁在连接退出后自动释放。
- `No previous release`：当前没有可回滚的上一版，首次发布后属于正常情况。
- 发布完成但浏览器显示旧内容：检查 Nginx 是否指向正确的 `current`，再检查浏览器或 CDN 缓存。
