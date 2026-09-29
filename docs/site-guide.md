# Pixel & Pointer 维护说明

本站基于 Hexo 8 与 Volantis 6.8.3，保留主题原生的封面、导航、文章卡片、侧栏与搜索界面。提弗洛斯角色图、淡紫色和深灰色用于装饰与配色，正文保持技术文档的阅读习惯。已有 `Hello World` 文章保留，没有代写个人经历或研究成果。

封面标题单独使用本地 Space Grotesk Medium，WOFF2 文件约 42 KB，仅首页预加载，其他文字继续使用系统字体。桌面文字移到角色右侧留白，手机文字置于 dock 上方，并用背景渐变保证可读性；主标题与一行技术副标题构成两级层次。作者卡片与页脚通过 CSS 美化原生组件。作者卡片头像为用户提供的 `source/assets/tephrofos/author-avatar.webp`，压缩为 256×256、约 16 KB，在 `sidebar.widget_library.blogger.avatar` 中配置。备案号在 `source/_volantis/footer.ejs` 中维护，当前为「辽ICP备2026000633号-1」，链接到工信部备案查询网站。

## 配置与扩展位置

| 位置 | 用途 |
| --- | --- |
| `_config.yml` | 站点名称、域名、语言、文章链接、Markdown 与代码高亮 |
| `_config.volantis.yml` | Volantis 功能开关、导航、配色、侧栏、本地依赖地址 |
| `source/_volantis/` | Volantis 官方注入点，放站点自己的 EJS 扩展 |
| `source/assets/tephrofos/` | 响应式角色图片与图标 |
| `source/css/tephrofos.css`、`source/js/tephrofos.js` | 角色配色与阅读交互 |
| `source/about/index.md`、`source/css/about.css` | 关于页的个人介绍、游戏卡片和 B 站展示，独立样式仅在关于页加载 |
| `source/_data/about.yml`、`tools/refresh-about.mjs` | 关于页公开账号配置与数据同步，详见 [About 数据维护](about-data.md) |
| `source/vendor/` | 固定版本的本地第三方资源及许可证 |
| `scripts/site-discovery.js` | 构建搜索索引、Atom、站点地图与 robots.txt |
| `scripts/reading-metrics.js` | 构建时统计字数和估算阅读时间 |
| `scripts/taxonomy-pages.js`、`layouts/taxonomy*.ejs` | 分类、标签索引与详情页头，复用主题的侧栏、文章列表和分页 |
| `source/css/taxonomy.css` | 分类与标签页面专用样式，由 `headEnd.ejs` 条件加载 |
| `scripts/mermaid-fences.js` | 把声明启用 Mermaid 的文章中的图表围栏转换成图表容器 |
| `scaffolds/` | `hexo new` 使用的文章、草稿与独立页模板 |

主题通过 Git 子模块保留在 `themes/volantis`，站点扩展放在主题目录外。升级时先在本地预览，对照新版本文档检查配置与注入点，再提交子模块版本变动。

## 日常命令

日常发布采用 [Git 更新与每天中午自动发布](git-deployment.md)。将源码推送到 [recode2025/blog](https://github.com/recode2025/blog) 的 `main` 分支后，Actions 构建并更新 `site` 分支；服务器每天北京时间 12:00 拉取，有更新时发布。推送成功不代表网站已经更新，需要等构建和服务器拉取都成功。安装定时任务或立即触发拉取见该文档，Nginx 配置、本地手动发布和回滚见 [部署说明](deployment.md)。

在仓库根目录运行。首次安装依赖使用 `pnpm install --frozen-lockfile`。

```sh
pnpm exec hexo new post "文章标题"
pnpm exec hexo new draft "草稿标题"
pnpm exec hexo publish "草稿标题"
pnpm run server
pnpm run build
```

预览服务默认位于 `http://localhost:4000`，静态构建结果在 `public/`。`pnpm run build` 会先清理 Hexo 缓存，再完整生成，确保主题配置与页面使用同一版样式。修改主题配置或 `scripts/` 后，重启正在运行的预览服务；仅生成 `public/` 不会刷新服务内存中的配置与脚本。修改文章时同时维护 `updated` 日期，订阅与站点地图会使用它。

明暗外观的优先级为「手动选择 > 系统外观 > 本地时间」。支持 `prefers-color-scheme` 的浏览器跟随 macOS、Windows 等系统明暗设置，系统自动切换时页面立即跟随；系统偏好不可用时，才按本地 07:00–19:00 浅色、其余时间深色兜底。导航中的模式按钮仍可手动切换，选择保留到下一个 07:00 或 19:00，跨页和刷新也有效；到点恢复跟随系统或时间兜底。页面保持打开、从后台返回时都会更新。时间范围在 `source/js/time-theme.js` 的 `lightHour`、`darkHour` 中调整；控制器通过 `scripts/time-theme.js` 接入，主题子模块无需修改。

## 技术文章写法

```yaml
---
title: 用 C++ 实现一个栈
date: 2026-09-29 10:00:00
updated: 2026-09-29 10:00:00
description: 介绍栈的接口与边界条件，并给出可运行的实现。
categories: [算法与数据结构]
tags: [C++, 栈]
toc: true
plugins: []
---
```

先写简短摘要，再用 `<!-- more -->` 分隔正文。正文从二级标题开始，文章目录自动提取标题。分类数组代表层级关系；需要并列分类时用 `categories: [[图形学], [C++]]`。标签可用于语言、库、工具和知识点，分类、标签页面会自动收录。

分类与标签页在构建时读取 Hexo 数据，显示文章数量和最近三篇记录。分类按父子关系展示，标签按名称排序，没有分类或标签时显示空态。索引介绍分别在 `source/categories/index.md`、`source/tags/index.md` 维护；新增文章后正常构建即可刷新，无需额外的浏览器脚本。站点脚本在 `before_generate` 注册本地 EJS 视图，主题子模块保持原样。

代码围栏标明语言，如 `cpp`、`python`、`bash`、`glsl`。高亮在构建时完成，代码复制由主题提供。长行会横向滚动，无需手动折行改变源码。

````markdown
```cpp
#include <iostream>

int main() {
    std::cout << "Hello, Pixel & Pointer!\n";
}
```
````

### 公式

只在需要的文章 front-matter 中添加 `plugins: [katex]`，再写块级公式。列表页摘要保持普通文本，公式放在 `<!-- more -->` 后。KaTeX 的脚本、样式和字体均来自本地资源目录。

```latex
$$
E = mc^2
$$
```

较复杂的公式可能与 Markdown 转义冲突，可放进原始 HTML 容器，让反斜杠和下标保持原样。

```html
{% raw %}
<div>
\[
\sum_{i=0}^{n} i = \frac{n(n+1)}{2}
\]
</div>
{% endraw %}
```

### 流程图与时序图

在文章中添加 `plugins: [mermaid]`，再使用 `mermaid` 围栏。需要同时显示公式与图表时写 `plugins: [katex, mermaid]`。只有声明了该插件的页面才会加载 Mermaid，普通文章和首页无需下载图表运行库。

````markdown
```mermaid
flowchart LR
  A[输入数据] --> B[执行算法]
  B --> C[输出结果]
```
````

### 折叠、提示与多语言示例

折叠内容适合日志、完整输出或长代码。主题的 `Folding` 使用 HTML `details`，无需额外动画库。标签名区分大小写。

````markdown
{% Folding 查看完整输出 %}
```text
Build succeeded.
```
{% endFolding %}

{% Note 提示 运行示例前先检查编译器版本。 color:purple %}

{% Tabs %}
<!-- tab Python -->
```python
print("hello")
```
<!-- tab C++ -->
```cpp
std::cout << "hello";
```
{% endTabs %}
````

这些写法与[Volantis 页面配置](https://volantis.js.org/v6/page-settings/)和[标签插件](https://volantis.js.org/v6/tag-plugins/)一致。扩展更多组件时可从这两页查找当前版本的参数。

## 阅读功能与性能取舍

| 功能 | 当前做法 |
| --- | --- |
| 站内搜索 | 使用 Volantis 原生搜索界面，搜索时才请求本地 `search.json`；支持 `/` 与 `Ctrl/Cmd + K` |
| 页面结构 | Volantis 原生全屏 dock 封面；滚动后显示导航和文章；1080px 内容宽度，1024px 以下复用原生折叠菜单 |
| 文章导航 | 全站导航在详情页保持固定，不随滚动方向轮替；桌面使用侧栏目录，768px 以下将原生目录按钮移入主导航，可用键盘选择章节和 Escape 收起 |
| 文章索引 | 归档、分类、标签和正文目录；没有文章的分类不预设空壳内容 |
| 订阅 | `/atom.xml` 提供最近 30 篇公开文章全文，可添加到支持 Atom 的 RSS 阅读器 |
| SEO | 站点地图、robots.txt、页面描述、Open Graph 与结构化数据 |
| 阅读辅助 | 浅色/深色切换、代码复制、字数、估算阅读时间、阅读进度和返回顶部 |
| 正文图片 | 按需加载，保留点击查看大图功能 |
| 公式与图表 | 每篇文章通过 `plugins` 声明，运行库使用固定版本本地文件 |
| 字体 | 系统中文字体与等宽代码字体；封面单独使用一个本地 WOFF2 字体，不下载整套中文字体 |
| 角色图 | 多尺寸 WebP，用于主题封面与小头像 |
| 评论 | 博客端已启用 Artalk，连接 `https://comments.recode88.cn`，按文章 URL 区分评论 |
| 音乐、轮播、视差、入场特效 | 默认关闭，减少首次加载与持续动画成本 |
| 访问统计、AI 摘要、动态友链接口 | 默认关闭，避免无凭据请求和额外的第三方请求 |
| PJAX、预加载 | 默认关闭，保持浏览器原生导航和页面插件初始化顺序 |

`search.json` 只含公开文章和可搜索的独立页。`search: false` 可将页面移出搜索，`feed: false` 可将文章移出订阅，`sitemap: false` 可将页面移出站点地图；`robots: noindex,follow` 的页面不会进入这些发现文件。草稿、`hidden: true`、`published: false` 或带 `password` 字段的内容也会被排除。这些字段仅控制发现文件，不提供访问控制；私人内容请保留在草稿或仓库外。

随着文章数量增多，应检查 `public/search.json` 的体积。索引当前保留全文，便于查找技术细节；若达到数 MB，可改成按年份分片或连接专门的搜索服务。不要为几篇文章提前引入搜索服务器。

## 连接评论

`_config.volantis.yml` 已设置 `comments.service: artalk`，服务地址为 `https://comments.recode88.cn`。评论所需的 JS 与 CSS 从同一后端的 `/dist/Artalk.js`、`/dist/Artalk.css` 加载，使客户端与服务端版本配套。更换评论域名时，需要同时更新这三个地址。

服务器需部署 Artalk 并配置域名、HTTPS 和站点 URL `https://www.recode88.cn`。宿主机 Nginx 的 IPv4/IPv6 双栈配置见 `deploy/nginx/comments.recode88.cn.conf`。当前主题会将博客标题中的 `&` 转义，实际发送的站点名称为 `Pixel &amp; Pointer`，Artalk 后台的站点名称应与之保持一致。

评论按文章 URL 区分，保持 `comments.artalk.path` 为空。文章 `comments: true` 会使用全局服务，关于页与 404 页默认关闭评论。修改配置后执行 `pnpm run build` 并发布 `public/`，再从正式站点提交测试评论并刷新确认。博客构建成功不代表评论服务已经上线。

## 发布前检查

1. 确认 `_config.yml` 的 `url` 是正式域名。当前保留 `https://www.recode88.cn`。
2. 执行 `pnpm run build`，检查首页、文章页、归档、分类、标签、关于页与 `/404.html`。
3. 用移动端宽度检查导航、代码滚动、搜索、暗色模式与角色图。
4. 检查 `/search.json`、`/atom.xml`、`/sitemap.xml` 和 `/robots.txt` 返回成功。
5. 发布 `public/` 静态文件，并在托管平台将未知路径交给 `404.html`。不要把所有未知地址重写为首页。

本次开发没有更改 DNS 或向线上托管平台发布内容。托管平台的压缩、缓存时长、CDN 与访问速度仍由实际部署设置决定。本地构建成功不能代替线上性能测试。

进一步开发参考[Volantis 开发文档](https://volantis.js.org/v6/development-api/)；修改前以本地主题版本及对应源码核对注入点。

主题升级后重点检查搜索、图片预览与文章插件的初始化是否正常；正文布局、封面与侧栏继续使用上游主题模板。

`source/js/volantis-search.js` 保留上游搜索界面，修复特殊字符查询、HTML 转义与加载失败重试。`tephrofos.js` 为原生灯箱增加“页面有图片才加载”的检查，补充搜索快捷键、阅读进度与专注阅读，并将文章页导航保持在全站菜单状态。目录沿用原生面板和章节跳转，手机端补齐开关、键盘及菜单互斥交互；不修改上游 `pdata.ispage` 或滚动状态。角色图在原生封面背景中展示，1080px WebP 约 79 KB，首页预加载，文章页不请求该背景。
