#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
roadmap_builder="${LEARNING_ROADMAP_BUILDER:-${HOME}/.skills/learning-roadmap/scripts/build_roadmap.py}"

if [[ ! -f "${roadmap_builder}" ]]; then
  echo "learning-roadmap builder not found: ${roadmap_builder}" >&2
  echo "Set LEARNING_ROADMAP_BUILDER to the build_roadmap.py path." >&2
  exit 1
fi

notes=()
if [[ "$#" -gt 0 ]]; then
  # Validate the complete explicit selection before writing any output.
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

for note in "${notes[@]}"; do
  output="${note%.md}-roadmap.html"
  python3 "${roadmap_builder}" "${note}" "${output}"
  # Link back to the repository root index.html with the depth the output file actually has
  # (notes live at topics/<category>/<note>.md or topics/<category>/<topic>/<note>.md).
  back_href="$(python3 -c 'import os, sys; print(os.path.relpath(sys.argv[1], os.path.dirname(os.path.abspath(sys.argv[2]))).replace(os.sep, "/"))' "${repo_root}/index.html" "${output}")"
  BACK_HREF="${back_href}" perl -0pi -e 's{<div class="meta">\s*}{<div class="meta">\n    <a class="back" href="$ENV{BACK_HREF}">← 返回总览</a>\n    }' "${output}"
done
