# AI Design Daily

给设计师看的 AI 热点日报静态站点，聚焦视觉生成、UX、产品设计、创意工具和可落地的工作流灵感。

## 本地预览

直接用浏览器打开 `index.html` 即可。

## 更新真实数据

运行下面的命令会从中文 RSS/公开源抓取真实条目并生成 `data/hotspots.json`：

```sh
node scripts/update-news.mjs
```

当前源包括：量子位、InfoQ 中文、36氪、IT之家。脚本会过滤非中文条目。

## 部署

站点可以通过 GitHub Pages 的 `gh-pages` 分支部署。
