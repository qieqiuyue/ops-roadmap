# 本地第三方渲染库

这些文件是 Roadmap 页面运行所需的全部第三方库，**随仓库发布**，因此页面在离线、内网或
CDN 受限的环境下也能正常渲染（代码高亮、Mermaid 图表、数学公式、Markdown 解析）。

| 文件 | 来源 | 字节 | 许可证 | sha384（上传时校验用） |
| --- | --- | --- | --- | --- |
| `mathjax-3.2.2-tex-svg.js` | `https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js` | 2,108,580 | Apache-2.0 | `sha384-KKWa9jJ1MZvssLeOoXG6FiOAZfAgmzsIIfw8BXwI9+kYm0lPCbC6yTQPBC00F1/L` |
| `marked-15.0.12.min.js` | `https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js` | 39,903 | MIT | `sha384-948ahk4ZmxYVYOc+rxN1H2gM1EJ2Duhp7uHtZ4WSLkV4Vtx5MUqnV+l7u9B+jFv+` |
| `highlight-11.9.0.min.js` | `https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js` | 121,727 | BSD-3-Clause | `sha384-F/bZzf7p3Joyp5psL90p/p89AZJsndkSoGwRpXcZhleCWhd8SnRuoYo4d0yirjJp` |
| `highlight-11.9.0-atom-one-dark.min.css` | `https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/atom-one-dark.min.css` | 856 | BSD-3-Clause | `sha384-oaMLBGEzBOJx3UHwac0cVndtX5fxGQIfnAeFZ35RTgqPcYlbprH9o9PUV/F8Le07` |
| `mermaid-10.9.8.min.js` | `https://cdn.jsdelivr.net/npm/mermaid@10.9.8/dist/mermaid.min.js` | 3,337,857 | MIT | `sha384-N3QqR/7q+xm3BGX+CBbNI8AUmRRqcsDzToy+0z1NLDI0QmTKW8zvwLvqulJgk3dP` |

## 与 CDN 版本的差异说明

- **MathJax 使用 `tex-svg` 而不是 `tex-mml-chtml`**：CHTML 输出需要在运行时抓取
  `output/chtml/fonts/tex-woff-v2/*.woff`，本地化时必须连同字体目录一起发布；SVG 输出自带矢量
  字形，体积更小且没有额外请求。页面只需要 TeX 输入（MathML 输入未使用），因此功能等价。
- **Mermaid 使用 UMD 单文件 `mermaid.min.js`**：ESM 入口（`mermaid.esm.min.mjs`）只有 76 字节，
  真正的实现在按需加载的兄弟分片里；本地化会引入分片图。UMD 单文件同样通过
  `window.mermaid` 暴露 `initialize` / `run`，与页面现有用法一致，代价是文件更大。
- 页面不再使用 `integrity` / `crossorigin`：资源与页面同源，SRI 不再提供额外保护。

## 升级流程

1. 从 jsdelivr 取目标版本的精确文件（**不要**用浮动版本，例如 `marked/marked.min.js` 会在上游
   发版后悄悄变化；当前它解析到 v15.0.12）。
2. 用新的 `<库>-<版本>-<文件>` 命名写入本目录，替换旧文件并删除旧命名的文件。
3. 更新上表的版本、字节数与 sha384（`sha384-` + base64(sha384(文件))）。
4. 更新所有页面里的引用：`scripts/` 没有自动化脚本做这件事，可用一次性替换：
   `grep -rl 'old-name' topics | xargs sed -i 's#old-name#new-name#g'`。
5. 逐类页面浏览器验证：代码高亮、Mermaid 图表、数学公式、抽屉渲染与进度功能，并确认
   `performance.getEntriesByType('resource')` 中没有外部主机请求。

## 降级行为

`assets/roadmap.js` 会在任一库缺失时在页面顶部插入提示条（`.vendor-warning`），说明
`assets/vendor/` 可能不完整、代码高亮/图表/公式可能不可用——不再静默失败。
