# 3D 作品集维护说明

作品集入口为 `/gallery/`，顶部导航和首页 dock 的入口名称为「作品」。页面沿用博客居中的圆角卡片容器，网格中的每件作品也有独立卡片，背景随深浅色主题切换。页面使用 WebGL 展示作品图片，作品列表在构建时生成 HTML，浏览器不支持 WebGL 时仍可使用网格浏览。

作品数据放在 `source/_data/portfolio.yml`。每个数组项对应一件作品，添加、删除数组项即可增删作品，调整数组项顺序即可调整展出顺序。现有内容是用于预览的示例作品，换成自己的作品时将 `demo` 设为 `false`。

```yaml
- title: My Project
  subtitle: 我的作品
  category: 3D
  year: '2026'
  image: /assets/gallery/my-project.webp
  description: 介绍作品的主题、制作过程或想表达的内容。
  tools: [Blender, Photoshop]
  demo: false
  url: /posts/my-project/
```

| 字段 | 内容 |
| --- | --- |
| `title` | 作品名称，必填 |
| `subtitle` | 简短副标题 |
| `category` | 必填，使用 `3D`、`Generative` 或 `Design`，分别对应空间、生成艺术、视觉设计筛选 |
| `year` | 展示年份，建议用引号包裹 |
| `image` | 必填，作品图片的站点路径或完整图片地址 |
| `description` | 作品详情中的文字说明 |
| `tools` | 工具、技术或主题标签，使用 YAML 数组 |
| `demo` | 自己的作品设为 `false`；`true` 显示「示例展品」标识 |
| `url` | 可选，作品详情中的「查看项目」链接；没有项目页时删除此字段 |

本地图片放在 `source/assets/gallery/`，`image` 填 `/assets/gallery/文件名`，不要包含 `source/`。建议使用压缩后的 WebP、JPEG 或 PNG；现有示例使用 SVG。为保持版面一致，可先将封面处理为 4:5 竖图。项目链接支持 `/posts/作品地址/` 等站内路径或 `https://` 开头的外部地址。远程图片用于 WebGL 时需要图片服务器允许跨域访问，优先使用本地图片。

修改后在仓库根目录构建或预览。

```sh
npm run build
npm run server
```

构建结果位于 `public/gallery/index.html`，本地预览地址为 `http://localhost:4000/gallery/`。检查作品图片、分类筛选、详情文字及项目链接。`source/gallery/index.html` 使用 `layout: page` 与 `gallery: true`，复用博客的导航、搜索、暗色模式、移动菜单和页脚；展厅内容放在 `.portfolio-gallery` 内，样式与脚本通过 `source/_volantis/` 的注入点按页加载。必须保留 front matter，且不能加入 `_config.yml` 的 `skip_render`，否则 Hexo 无法渲染作品标签。正常构建会自动将作品集页面加入站内搜索和 sitemap。

交互方式如下。

- 移动鼠标产生视差，改变展厅视角；拖动浏览作品，滚轮缩放。
- 视角按钮可拉近、拉远或重置；聚焦展厅后使用左右方向键选择作品，`Enter` 查看详情，`Home` 重置视角。
- 点击作品查看详情，使用详情中的左右箭头切换作品，按 `Esc` 或关闭按钮退出详情。
- 顶部分类按钮筛选作品，「空间 / 网格」切换浏览方式。WebGL 不可用时使用网格；JavaScript 不可用时仍保留图片与作品信息。

需要调整样式或交互时，分别修改 `source/css/gallery.css` 和 `source/js/gallery.js`。页面结构在 `source/gallery/index.html`，作品 HTML 生成逻辑在 `scripts/portfolio-gallery.js`，均无需修改 Volantis 主题子模块。
