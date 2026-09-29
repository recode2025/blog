# Git 更新与每天中午自动发布

源码仓库为 [recode2025/blog](https://github.com/recode2025/blog)，日常提交到 `main`。GitHub Actions 构建 Hexo，把生成的静态文件提交到 `site` 分支。服务器每天北京时间 12:00 执行 `git pull --ff-only`，有新版本时发布，没有变化时直接结束。

网站更新分成两步。`git push` 成功表示源码已上传，Actions 成功表示 `site` 已准备好；服务器下一次拉取并切换成功后，正式网站才会更新。在 12:00 之后完成的构建默认于次日 12:00 发布，也可以手动触发服务器更新。

服务器只需要 Bash、Git、tar 和 flock，无需安装 Node.js、pnpm 或 rsync。仓库当前公开，服务器可以通过 HTTPS 免登录拉取。GitHub Actions 不连接服务器，也不需要配置服务器 SSH Secrets。Artalk 评论服务仍独立运行。

## 1. 推送源码并等待首次构建

在本地项目目录提交并推送到 `main`：

```sh
git add .
git status --short
git commit -m "Update blog"
git push origin main
```

打开 [仓库 Actions](https://github.com/recode2025/blog/actions)，等待本次构建成功，并确认仓库已有 `site` 分支，再开始服务器首次拉取。首次构建前没有 `site` 分支，服务器不能完成初始化。

工作流文件在 `.github/workflows/deploy.yml`。它会递归检出固定版本的主题子模块，按锁文件安装依赖，运行部署测试并构建 `public/`。源码中的 About 公开数据快照会随构建使用，无需提供个人账号凭据。生成内容没有变化时，不产生新的静态文件版本。

`main` 保存源码，`site` 由工作流维护。不要把 `public/` 手动提交到 `main`，也不要手动修改 `site`。若仓库规则阻止 Actions 写入 `site`，调整对应规则，允许该工作流更新静态分支。

## 2. 准备服务器账号和目录

以下在运行 Nginx 的 Linux 服务器执行，以 `deploy` 用户、`/var/www/blog` 目录为例。先检查工具是否存在：

```sh
command -v bash git tar flock
```

Ubuntu 通常已包含 Bash、tar 和 flock。只补装实际缺少的工具；若缺少 Git，可在软件源和 DNS 正常后执行 `sudo apt-get install git`。无需为了这套部署单独升级 `util-linux`。

已有 `deploy` 用户时保留原账号，否则创建专用账号，然后准备目录：

```sh
id deploy >/dev/null 2>&1 || sudo useradd --system --user-group \
  --create-home --home-dir /var/lib/blog-deploy --shell /bin/bash deploy
sudo install -d -o deploy -g deploy -m 755 /var/www/blog /var/www/blog/releases
```

`deploy` 必须能写入部署目录，Nginx 必须能读取发布后的文件。若现有 `current` 是真实目录，先备份并迁移旧站；脚本会拒绝覆盖不受管理的目录或链接。

## 3. 安装拉取脚本和定时任务

在服务器临时检出 `main`，仅用于安装脚本和配置，不需要初始化主题或安装前端依赖：

```sh
blog_setup=$(mktemp -d)
git clone --depth 1 --branch main https://github.com/recode2025/blog.git "$blog_setup"
sudo install -m 755 "$blog_setup/deploy/pull.sh" /usr/local/bin/blog-pull
sudo install -d -m 755 /usr/local/lib/blog
sudo install -m 755 "$blog_setup/deploy/publish.sh" /usr/local/lib/blog/publish.sh
sudo install -m 644 "$blog_setup/deploy/systemd/blog-pull.service" /etc/systemd/system/blog-pull.service
sudo install -m 644 "$blog_setup/deploy/systemd/blog-pull.timer" /etc/systemd/system/blog-pull.timer
sudo systemctl daemon-reload
sudo systemctl enable --now blog-pull.timer
sudo systemctl start blog-pull.service
```

最后一条命令立即完成首次拉取和发布。定时器明确使用 `Asia/Shanghai` 时区，每天 12:00 执行，不依赖服务器本地时区。`Persistent=true` 会在服务器开机、定时器恢复后补跑停机期间错过的一次计划；日常失败不会自动高频重试，可排除故障后手动执行，或等待下一天。

服务以 `deploy` 用户执行以下命令：

```sh
/usr/local/bin/blog-pull /var/www/blog https://github.com/recode2025/blog.git site
```

如使用其他用户名或部署目录，先调整服务文件中的 `User`、`Group`、`ExecStart` 和相关目录限制，再启用定时器；Nginx 的 `root` 也应指向该目录的 `current`。

仓库里的安装文件不会通过 `site` 自动更新到系统目录。以后修改 `deploy/pull.sh`、`deploy/publish.sh` 或 systemd 配置时，重新从 `main` 安装对应文件，并执行 `sudo systemctl daemon-reload`；定时器配置发生变化时还需重启定时器。

## 4. 确认运行结果与 Nginx

```sh
sudo systemctl status blog-pull.service --no-pager
sudo systemctl list-timers blog-pull.timer --all
sudo journalctl -u blog-pull.service -n 80 --no-pager
readlink /var/www/blog/current
```

服务是一次性任务，成功完成后显示 `inactive (dead)` 属于正常情况，检查退出状态和日志即可。`list-timers` 会显示下次执行时间，显示时区可能跟随服务器设置；定时器的计划本身仍是北京时间 12:00。

Nginx 使用 [www.recode88.cn.conf](../deploy/nginx/www.recode88.cn.conf)，`root` 保持 `/var/www/blog/current`。该配置将 IPv4、IPv6 上的裸域 HTTP/HTTPS，以及 www 的 HTTP 请求，统一跳转到 `https://www.recode88.cn`。证书和首次启用步骤见 [Nginx 配置说明](deployment.md#nginx-与-https)。日常版本切换无需重载 Nginx。

服务器目录如下：

```text
/var/www/blog/
├── .site-repo/       # site 分支的本地检出，不在 Nginx 网站根目录内
├── releases/        # 每次发布的完整静态文件
├── current -> releases/<当前版本>/
└── previous -> releases/<上一版本>/
```

每次运行先拉取 `site`，再判断当前线上版本。没有更新时不创建新发布目录；有更新时从 Git 导出完整文件，检查关键页面后原子切换 `current`。网络、拉取或文件检查失败时保留原网站；即使仓库已拉取成功而上次发布失败，下次运行仍会重试发布。

## 5. 日常更新和立即发布

日常只需在电脑上提交并推送：

```sh
git add .
git commit -m "Update blog"
git push origin main
```

等待 Actions 成功，服务器会在下一次计划执行时更新。需要立即发布时，在服务器执行：

```sh
sudo systemctl start blog-pull.service
sudo journalctl -u blog-pull.service -n 40 --no-pager
```

也可以在 Actions 页面手动运行构建工作流；它只更新 `site`，不会直接触发服务器。服务器同一时间只运行一个拉取任务，版本切换与手动回滚也受文件锁保护。

## 6. 回滚、暂停和恢复

在服务器切回上一版本：

```sh
sudo systemctl stop blog-pull.timer
sudo systemctl stop blog-pull.service
sudo -u deploy bash /usr/local/lib/blog/publish.sh /var/www/blog rollback
```

回滚交换 `current` 和 `previous`，不删除文件；首次发布没有上一版本时无法回滚。先停止定时器和正在运行的拉取服务，可避免它们紧接着重新发布 `site` 的最新版本。`stop` 只暂停当前运行，若需要重启服务器后也保持暂停，使用 `sudo systemctl disable --now blog-pull.timer`。

要长期撤销某次内容变更，在本地对对应源码提交执行 `git revert` 并推送，等待 Actions 生成修复后的 `site`。确认后恢复定时器，并立即拉取一次：

```sh
sudo systemctl enable --now blog-pull.timer
sudo systemctl start blog-pull.service
```

历史发布目录不会自动删除。定期检查空间，在没有发布运行时清理不被 `current` 或 `previous` 引用的旧版本，详见 [版本管理说明](deployment.md#回滚与版本管理)。

## 常见问题

- 找不到 `site` 分支：先等待首次 Actions 构建成功，检查日志和仓库分支列表。
- 推送了但网站未更新：分别确认 Actions 成功、`site` 有更新，以及服务器今天的拉取是否已执行。构建在 12:00 后完成时需等次日或手动拉取。
- GitHub 域名解析失败或连接超时：检查服务器 DNS 和到 GitHub 的网络连通性，排除后重新启动 `blog-pull.service`。
- 服务报目录权限错误：检查 `deploy` 对 `/var/www/blog` 的写权限，以及服务中的用户和目录限制。
- 拉取提示不能快进或存在本地修改：不要手动编辑 `.site-repo`。先检查并备份其中的改动，再处理分支差异；脚本不会自动丢弃改动或强制重置。
- 构建成功但无法写入 `site`：检查 Actions 的仓库写权限和分支保护规则。

如果以后把仓库改为私有，可为服务器 `deploy` 用户配置 GitHub 只读 Deploy Key，并通过 `systemctl edit blog-pull.service` 把仓库地址改成 `git@github.com:recode2025/blog.git`。先按 [GitHub 公布的 SSH 主机指纹](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints) 核对主机，再写入该用户的 `known_hosts`；仓库只添加公钥，私钥保留在服务器。修改 `ExecStart` 时需先用空的 `ExecStart=` 清除原值，再填写完整新命令，之后执行 `daemon-reload`。若已有 HTTPS 检出，还需把 `.site-repo` 的 `origin` 改为同一 SSH 地址。

本仓库提供配置和安装步骤。服务器执行安装并检查日志、下次触发时间后，才算定时部署已启用。
