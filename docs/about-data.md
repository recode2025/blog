# About 页的数据

页面通过 Hexo 的 `about_games`、`about_bilibili` 与 `about_github` 标签生成静态 HTML。浏览器只读取页面和公开图片，不请求账号接口，也不携带 Cookie。

- `source/_data/about.yml` 保存展示配置和手填数据。
- `source/_data/about-live.json` 保存最近成功获取的数据、数据时间与各部分的同步状态。
- `tools/refresh-about.mjs` 从公开接口或指定 JSON 快照更新缓存。

修改配置后运行：

```sh
node tools/refresh-about.mjs
npm run build
```

只更新一部分时可用 `node tools/refresh-about.mjs --only games`、`node tools/refresh-about.mjs --only bilibili` 或 `node tools/refresh-about.mjs --only github`，其他部分缓存保持不变。也支持单个游戏 ID，例如 `--only wuthering`。

同步不绑定普通构建，接口暂时不可用不会让静态网站构建失败。需要定期更新时，在自己的构建流程中先执行同步命令。不要高频运行；Enka 会按返回的 `ttl` 复用缓存，收到 HTTP 429 后至少等一小时。各数据部分独立失败并保留旧的成功结果及其原始时间；从未成功获取的字段不显示。合法的数字 `0` 仍然显示。

## GitHub

已配置公开账号 `recode2025`，通过 [GitHub REST 用户接口](https://docs.github.com/en/rest/users/users#get-a-user) 同步头像、公开简介、关注者、关注数与公开仓库总数。不请求邮箱、私有仓库或其他非公开信息，也不读取本地 GitHub token、GitHub CLI 登录状态或任何认证凭据。

```yaml
github:
  username: recode2025
  repository_limit: 3
```

卡片选取本人拥有、公开、非 fork 且未归档的仓库，按照最近推送时间倒序排列，默认展示 3 个，可通过 `repository_limit` 调整为 1 至 6。使用 [公开仓库列表接口](https://docs.github.com/en/rest/repos/repos#list-repositories-for-a-user) 分页筛选，排除项不会占用名额；没有符合条件的仓库时保留真实空列表。仓库名称、简介、主要语言、Stars、Forks 和推送时间均来自 API，缺失的简介与语言不会补写虚构内容。卡片中的公开仓库总数是账号全部公开仓库的数量，与这里筛选后的项目数量含义不同。

单独更新时运行 `node tools/refresh-about.mjs --only github`，不会刷新 B 站和游戏。普通全量同步也包含 GitHub。仅大小写变化仍视作同一用户名，更换账号则不会继承前一个账号的数据。

个人资料和仓库列表独立保存成功时间。接口失败时保留各自的旧缓存；限流时按 [GitHub 限流说明](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) 使用 `Retry-After` 和 `X-RateLimit-Reset` 计算下次允许请求的时间，冷却期间不再次请求 GitHub。页面保持静态显示最近成功的数据。

## B 站

配置已填写 UID `475363158`，最多展示 6 条最新公开投稿，可通过 `video_limit` 调整为 1 至 12。

数据源为 B 站公开关系统计接口、WBI 公开用户资料及投稿接口。公开用户资料受限时，使用直播公开资料中的账号昵称和头像；直播等级不会当作 B 站等级。WBI 密钥来自公开 nav 接口，脚本执行普通请求签名，不登录、不处理验证码。

当前实际同步到的资料为 `recode2025`、公开头像、粉丝与关注数。投稿接口在本次环境中返回风控错误，页面因此提供投稿页入口，未把失败当作没有投稿。该限制保存在缓存状态中。以后接口恢复可用，再运行同步命令即可自动生成视频卡片。

如需现在显示自己选定的视频，可在 `bilibili.videos` 填入真实公开条目。只有没有成功的远端视频缓存时使用此备用列表；标题、封面、播放量等都应来自你确认过的视频。

```yaml
bilibili:
  uid: '475363158'
  video_limit: 6
  videos:
    - bvid: '填写真实 BV 号'
      title: '填写视频标题'
      cover: 'https://填写公开封面地址'
      publishedAt: '2026-09-29T00:00:00+08:00'
      # views、duration 可省略；未知播放量请省略，不要写 0。
```

不要在配置中填写 SESSDATA、CSRF、access token 或浏览器导出的 Cookie。同步命令只把经过筛选的公开字段写入缓存。

## 游戏档案

四款游戏的官服卡片已配置。崩铁 `133043327`、终末地 `1823280141`、绝区零 `24816656` 已按用户提供的 UID 实际同步。当前公开数据分别为崩铁等级 70、角色 64、成就 1165；终末地等级 60、展柜角色 4；绝区零等级 60、展柜角色 6。数据时间保存在缓存中，后续同步可能变化。鸣潮 UID `116584675` 已配置，等待本地本人授权。

任意游戏都可改用 `provider: manual`，直接填写 `stats` 和 `updated_at`，不需要调用接口。

```yaml
uid: '填写自己的游戏 UID'
provider: manual
updated_at: '2026-09-29T00:00:00+08:00'
stats:
  level: null
  characters: null
  achievements: null
```

把 `null` 改为经过确认的非负数字。省略或保留 `null` 的字段不会显示。更换 UID、区服或来源后，不会继续展示前一个账号的缓存。

### Enka 公开展柜

崩坏：星穹铁道、绝区零和明日方舟：终末地可把 `provider` 改为 `enka` 并填写 UID。必须在游戏中允许相应资料公开，能读取哪些字段由公开档案决定。

| 游戏 | 当前读取的公开字段 | 注意事项 |
| --- | --- | --- |
| 崩坏：星穹铁道 | 等级、公开的拥有角色数量、成就数量 | 尊重公开记录与收藏的隐私设置；隐藏字段不会继续复用旧数字 |
| 绝区零 | 等级、展柜角色数量 | 展柜人数不代表全部拥有角色；不从徽章推算总成就 |
| 明日方舟：终末地 | 等级、展柜角色数量 | 只统计公开角色数组；不推测全部干员或全部成就 |
| 鸣潮 | 可选本人库街区授权、手填或快照 | 不能只凭 UID 查询完整个人数据，见下文 |

Enka 是第三方公开展柜服务，不能保证中国官服每个 UID 或每项资料都可查询。适配器只读取已经核验过的响应字段；未提供的总角色或成就数量不显示。仍可在 `stats` 补充你确认过但公开服务没有提供的字段；明确设为隐藏的公开字段会优先保持隐藏。

脚本遵循 [Enka API 使用说明](https://github.com/EnkaNetwork/API-docs/blob/master/api.md) 中的自定义 User-Agent、TTL 缓存和限流要求。适配路径分别是 `/api/hsr/uid/`、`/api/zzz/uid/`、`/api/ef/uid/`。

### 鸣潮的本人授权数据

鸣潮适配参考用户指定的 [XutheringWavesUID](https://github.com/Loping151/XutheringWavesUID) 的库街区请求流程。读取本人等级、角色与成就需要本人库街区登录 token 和该登录设备的 device ID，仅有游戏 UID 不够。当前已填写 UID `116584675` 和 `provider: wuthering`。在本地 `.env.about.local` 填写：

```dotenv
WUTHERING_TOKEN='本人的库街区 token'
WUTHERING_DEVICE_ID='本人登录设备的 device ID'
```

已准备空的 `.env.about.local` 并设为 Git 忽略。换到其他电脑时可从 `.env.about.example` 复制。填好后运行 `npm run sync:about:local -- --only wuthering`，再运行 `npm run build`。也可从系统环境变量载入。不要把实际凭据发送到聊天、写入 `about.yml`、提交 Git 或发布到静态站。同步只保存经过筛选的等级、角色数和成就数；不会保存 token、设备标识或完整登录响应。

适配器只使用自己的凭据，不使用共享 Cookie 池或其他用户的凭据。库街区可能要求本人先完成角色绑定；登录过期、未绑定、风控或接口变化时保留上一次有效统计并标记稍后更新。没有凭据时可继续使用手填或公开 JSON 快照。当前尚未配置本地授权环境，因此鸣潮线上个人数据尚未验证。

### 本地或公开 JSON 快照

如果已经有自己授权导出的游戏数据，可选择 `provider: snapshot`，并填写项目相对路径、绝对文件路径，或无需鉴权的公开 HTTPS JSON 地址：

```yaml
provider: snapshot
snapshot: data/my-game-public.json
```

快照采用以下结构，将 `null` 换成真实数据，并确保至少有一个数字字段：

```json
{
  "uid": "与配置相同的游戏 UID",
  "updatedAt": "2026-09-29T00:00:00+08:00",
  "level": null,
  "characters": null,
  "achievements": null,
  "showcaseCharacters": null
}
```

`characters` 表示拥有角色总数，`showcaseCharacters` 仅表示公开展示数量，两者不会混用。快照必须带原始数据的 `updatedAt`，导入时间不会伪装成数据更新时间。导入器只保留这几个公开统计字段，额外字段不会进入页面。原始导出文件建议放在 `source` 之外，避免意外作为静态资源发布；不要上传任何登录凭据。
