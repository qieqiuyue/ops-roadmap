#!/usr/bin/env bash
#
# Generate roadmap.md (the knowledge-map preview) from the catalog embedded in index.html,
# so the preview can never drift from the navigation entry point.
# Links to a topic directory are emitted as links to its README.md, because GitHub Pages
# serves no directory indexes (`.nojekyll`); directories with an entry `index.html` keep
# the directory form.
#
# Usage:
#   ./scripts/build-roadmap-md.sh          # rewrite roadmap.md
#   ./scripts/build-roadmap-md.sh --check  # exit 2 when roadmap.md is stale, write nothing
#
# Only python3 is required.
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "${repo_root}" "${1:-}" <<'PY'
import json, re, sys
from pathlib import Path

ROOT = Path(sys.argv[1])
CHECK = sys.argv[2] == "--check"
INDEX = ROOT / "index.html"
TARGET = ROOT / "roadmap.md"

text = INDEX.read_text(encoding="utf-8", errors="replace")
match = re.search(r"const catalog = (\[.*?\n\]);", text, re.S)
if not match:
    raise SystemExit("could not locate the catalog array in index.html")

js = re.sub(r"([{,])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:", r'\1"\2":', match.group(1))
catalog = json.loads(js.replace("'", '"'))

categories = len(catalog)
topics = sum(len(c["topics"]) for c in catalog)
items = sum(len(t["items"]) for c in catalog for t in c["topics"])

# Directory URLs have no index on GitHub Pages (see .nojekyll), so a catalogue entry
# points at the directory README.md instead; directories that ship an index.html entry
# page keep the plain directory form.
def doc_link(directory: str) -> str:
    target = ROOT / directory
    if (target / "README.md").is_file() and not (target / "index.html").is_file():
        return directory + "README.md"
    return directory

lines = []
lines.append("# Ops Roadmap 思维导图预览")
lines.append("")
lines.append("> 本文件由 `scripts/build-roadmap-md.sh` 从 [`index.html`](./index.html) 的 catalog 生成，请勿手工编辑。")
lines.append("")
lines.append(f"知识版图按 `topics/` 的实际内容组织，当前包含 **{categories} 个分类、{topics} 个主题、{items} 份标准路线图**。"
             "交互式入口见 [首页](./index.html)，完整说明见 [README 内容导航](./README.md#内容导航)。")
lines.append("")
lines.append("```mermaid")
lines.append("flowchart LR")
lines.append("  root((Ops Roadmap))")
for ci, category in enumerate(catalog):
    lines.append(f"  root --> cat{ci}[{category['name']}]")
    for ti, topic in enumerate(category["topics"]):
        lines.append(f"  cat{ci} --> t{ci}_{ti}[{topic['name']}]")
lines.append("")
lines.append("  classDef rootNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff,stroke-width:3px")
lines.append("  classDef categoryNode fill:#dbeafe,stroke:#3b82f6,color:#172554,stroke-width:2px")
lines.append("  class root rootNode")
lines.append("  class " + ",".join(f"cat{i}" for i in range(categories)) + " categoryNode")
lines.append("```")
lines.append("")
lines.append("## 分类与主题")
lines.append("")
lines.append("| 分类 | 主题（路线图册数） |")
lines.append("| --- | --- |")
for category in catalog:
    cells = []
    for topic in category["topics"]:
        directory = "/".join(topic["items"][0][1].split("/")[:-1]) + "/"
        cells.append(f"[{topic['name']}]({doc_link(directory)})（{len(topic['items'])}）")
    lines.append(f"| {category['name']} | " + " · ".join(cells) + " |")
lines.append("")
lines.append("## 其他内容树")
lines.append("")
lines.append("`topics/` 之外还有四棵内容树，它们不参与 Roadmap 生成：")
lines.append("")
lines.append("| 目录 | 内容 |")
lines.append("| --- | --- |")
lines.append("| [`cases/`](./cases/README.md) | 企业实践案例，按可靠性、可观测性、DevOps、AIOps、云原生、FinOps 与工程管理分类 |")
lines.append("| [`interview/`](./interview/README.md) | 面试与简历准备：面试官视角、表达方式与复盘方法 |")
lines.append("| [`prompts/`](./prompts/README.md) | 面向 Agentic Coding 环境的模型专项提示词参考 |")
lines.append("| [`learning-paths/`](./learning-paths/) | 六条岗位学习路线、配套实验室与进度记录 |")
lines.append("")
lines.append("## 保留的动画版")
lines.append("")
lines.append("以下两个页面是完整动画版，不参与批量生成，需要与其 `roadmap-animations/` sidecar 一起维护：")
lines.append("")
lines.append("- [Linux 性能优化 · 完整动画版](./topics/systems/linux-performance/full-animated-roadmap.html)")
lines.append("- [Kubernetes · 完整动画版](./topics/cloud-native/kubernetes/full-animated-roadmap.html)")
lines.append("")
generated = "\n".join(lines)

if CHECK:
    current = TARGET.read_text(encoding="utf-8", errors="replace") if TARGET.exists() else ""
    if current.replace("\r\n", "\n") != generated:
        print("STALE: roadmap.md differs from the generated content", file=sys.stderr)
        raise SystemExit(2)
    print("roadmap.md is up to date.")
else:
    TARGET.write_text(generated, encoding="utf-8", newline="\n")
    print(f"wrote roadmap.md ({categories} categories, {topics} topics, {items} roadmaps).")
PY
