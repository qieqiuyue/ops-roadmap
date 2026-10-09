#!/usr/bin/env bash
#
# Validate the generated-roadmap contract described in AGENTS.md.
#
# Checks:
#   1. every formal note has exactly one matching *-roadmap.html (and no orphan roadmaps);
#   2. every roadmap links back to the root index.html with a path matching its own depth;
#   3. every roadmap is linked from the root index.html;
#   4. every embedded <script id="data"> payload is valid JSON with a title and parts;
#   5. every note has exactly one H1;
#   6. every note has balanced code fences (an even number of ``` / ~~~ markers);
#   7. markdown tables keep a consistent column count inside each contiguous block;
#   8. every note H2 chapter title appears in its roadmap payload.
#
# Only python3 is required (no ripgrep, no node).
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "${repo_root}" <<'PY'
import collections, json, os, re, sys
from pathlib import Path

ROOT = Path(sys.argv[1])
errors = []

def fail(message):
    errors.append(message)

def rel(path):
    return str(Path(path).relative_to(ROOT)).replace(os.sep, "/")

def split_markdown(text):
    """Yield (line_no, line, inside_fence)."""
    inside = False
    for number, line in enumerate(text.splitlines(), 1):
        if re.match(r"^\s*(```|~~~)", line):
            inside = not inside
            yield number, line, True
            continue
        yield number, line, inside

def cells(line):
    body = line.strip()[1:]
    if body.endswith("|") and not body.endswith("\\|"):
        body = body[:-1]
    return len(re.split(r"(?<!\\)\|", body))

notes = sorted(p for p in (ROOT / "topics").rglob("*.md")
               if p.name not in ("README.md", "outline.md")
               and "roadmap-animations" not in p.parts)
roadmaps = sorted(p for p in (ROOT / "topics").rglob("*-roadmap.html"))
animated = {"topics/cloud-native/kubernetes/full-animated-roadmap.html",
            "topics/systems/linux-performance/full-animated-roadmap.html"}

# 1. note <-> roadmap parity
note_set = {rel(note) for note in notes}
for note in notes:
    roadmap = note.with_name(note.name[:-3] + "-roadmap.html")
    if not roadmap.exists():
        fail(f"missing roadmap: {rel(note)} -> {roadmap.name}")
for roadmap in roadmaps:
    source = rel(roadmap)[:-len("-roadmap.html")] + ".md"
    if source not in note_set and rel(roadmap) not in animated:
        fail(f"orphan roadmap without source note: {rel(roadmap)}")

# 2. back link depth
for roadmap in roadmaps:
    text = roadmap.read_text(encoding="utf-8", errors="replace")
    expected = os.path.relpath(ROOT / "index.html", roadmap.parent).replace(os.sep, "/")
    found = set(re.findall(r'href="([^"]*index\.html)"', text))
    if not found:
        fail(f"no root index.html back link: {rel(roadmap)}")
    for href in found:
        if href != expected:
            fail(f"back link depth wrong: {rel(roadmap)} has {href!r}, expected {expected!r}")

# 3. catalog coverage (index.html stores its catalog inside a JS array)
index_text = (ROOT / "index.html").read_text(encoding="utf-8", errors="replace")
catalog_links = {link.lstrip("./") for link in re.findall(r"""['"]([^'"]*\.html)['"]""", index_text)}
for roadmap in roadmaps:
    if rel(roadmap) not in catalog_links:
        fail(f"roadmap not linked from index.html: {rel(roadmap)}")
for link in sorted(catalog_links):
    if not (ROOT / link).exists():
        fail(f"index.html links a missing file: {link}")

# 4. payload validity
payloads = {}
for roadmap in roadmaps:
    text = roadmap.read_text(encoding="utf-8", errors="replace")
    match = re.search(r'<script id="data" type="application/json">(.*?)</script>', text, re.S)
    if not match:
        fail(f"missing roadmap data payload: {rel(roadmap)}")
        continue
    try:
        data = json.loads(match.group(1))
    except Exception as error:
        fail(f"invalid roadmap JSON payload: {rel(roadmap)}: {error}")
        continue
    if not data.get("title") or not data.get("parts"):
        fail(f"roadmap payload without title/parts: {rel(roadmap)}")
    payloads[roadmap] = data

# 5./6./7./8. per-note markdown rules
for note in notes:
    text = note.read_text(encoding="utf-8", errors="replace")
    rows = list(split_markdown(text))

    if sum(1 for _, line, inside in rows if not inside and re.match(r"^#\s+\S", line)) != 1:
        fail(f"note must have exactly one H1: {rel(note)}")
    if sum(1 for _, line, _ in rows if re.match(r"^\s*(```|~~~)", line)) % 2:
        fail(f"unbalanced code fences: {rel(note)}")

    block = []
    for number, line, inside in rows + [(0, "", False)]:
        stripped = line.strip()
        if not inside and stripped.startswith("|") and stripped.endswith("|") and stripped.count("|") >= 3:
            block.append((number, cells(stripped)))
            continue
        widths = collections.Counter(width for _, width in block)
        if len(block) >= 2 and len(widths) > 1:
            fail(f"table column mismatch near line {block[0][0]}: {rel(note)} {dict(widths)}")
        block = []

    roadmap = note.with_name(note.name[:-3] + "-roadmap.html")
    if roadmap in payloads:
        payload_text = json.dumps(payloads[roadmap], ensure_ascii=False)
        for _, line, inside in rows:
            if inside:
                continue
            match = re.match(r"^##\s+(\S.*?)\s*$", line)
            if match and match.group(1).replace(" ", "") not in payload_text.replace(" ", ""):
                fail(f"chapter missing from roadmap payload: {rel(note)} -> {match.group(1)}")

if errors:
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    print(f"Roadmap validation failed: {len(errors)} error(s).", file=sys.stderr)
    raise SystemExit(1)

print(f"Roadmap validation passed: {len(notes)} notes, {len(roadmaps)} roadmaps.")
PY
