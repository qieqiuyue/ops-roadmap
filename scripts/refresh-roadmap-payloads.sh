#!/usr/bin/env bash
#
# Refresh the embedded <script id="data"> payload of existing roadmap HTML files
# without touching their HTML/CSS/JS template.
#
# Why: the public builder (learning-roadmap/build_roadmap.py) parses Markdown
# identically to the builder that produced the committed roadmaps, but its HTML
# template has drifted (newer versions add MathJax, a resizable drawer and an
# edit mode). Running scripts/build-roadmaps.sh therefore rewrites every page
# template; this script updates only the data payload, which is what content
# edits actually change.
#
# Usage:
#   ./scripts/refresh-roadmap-payloads.sh [note.md ...]
#
# With no arguments every formal note under topics/ is refreshed. Requires the
# same builder as scripts/build-roadmaps.sh:
#   LEARNING_ROADMAP_BUILDER=/path/to/build_roadmap.py ./scripts/refresh-roadmap-payloads.sh
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
roadmap_builder="${LEARNING_ROADMAP_BUILDER:-${HOME}/.skills/learning-roadmap/scripts/build_roadmap.py}"
check_only=0
if [[ "${1:-}" == "--check" ]]; then
  check_only=1
  shift
fi

if [[ ! -f "${roadmap_builder}" ]]; then
  echo "learning-roadmap builder not found: ${roadmap_builder}" >&2
  echo "Set LEARNING_ROADMAP_BUILDER to the build_roadmap.py path." >&2
  exit 1
fi

notes=()
if [[ "$#" -gt 0 ]]; then
  for requested_note in "$@"; do
    note="$(python3 -c 'from pathlib import Path; import sys; print(Path(sys.argv[1]).resolve())' "${requested_note}")"
    case "${note}" in
      "${repo_root}/topics/"*.md) ;;
      *) echo "Note must be a Markdown file under topics/: ${requested_note}" >&2; exit 1 ;;
    esac
    case "${note}" in
      */README.md|*/outline.md|*/roadmap-animations/*)
        echo "Not a formal learning note: ${requested_note}" >&2; exit 1 ;;
    esac
    [[ -f "${note}" ]] || { echo "Note not found: ${requested_note}" >&2; exit 1; }
    notes+=("${note}")
  done
else
  while IFS= read -r -d '' note; do
    notes+=("${note}")
  done < <(
    find "${repo_root}/topics" -type f -name '*.md' \
      ! -name 'outline.md' \
      ! -name 'README.md' \
      ! -path '*/roadmap-animations/*' \
      -print0 | sort -z
  )
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

refresh() {
  local generated="$1" roadmap="$2"
  python3 - "${generated}" "${roadmap}" "${check_only}" <<'PY'
import json, re, sys
generated, roadmap, check_only = sys.argv[1], sys.argv[2], sys.argv[3] == "1"

def payload_block(path):
    text = open(path, encoding="utf-8", newline="").read()
    m = re.search(r'(<script id="data" type="application/json">)(.*?)(</script>)', text, re.S)
    if not m:
        raise SystemExit(f"no roadmap data payload in {path}")
    return text, m

gen_text, gen_match = payload_block(generated)
out_text, out_match = payload_block(roadmap)
payload = gen_match.group(2)
json.loads(payload)  # fail loudly instead of writing a broken page

updated = out_text[: out_match.start(2)] + payload + out_text[out_match.end(2):]
name = roadmap
if updated == out_text:
    print(f"unchanged  {name}")
elif check_only:
    print(f"STALE      {name}")
    raise SystemExit(2)
else:
    open(roadmap, "w", encoding="utf-8", newline="").write(updated)
    print(f"updated    {name}")
PY
}

for note in "${notes[@]}"; do
  roadmap="${note%.md}-roadmap.html"
  if [[ ! -f "${roadmap}" ]]; then
    echo "skip (no roadmap): ${note#"${repo_root}/"}" >&2
    continue
  fi
  generated="${tmp_dir}/$(basename "${roadmap}")"
  python3 "${roadmap_builder}" "${note}" "${generated}" > /dev/null
  refresh "${generated}" "${roadmap}"
done
