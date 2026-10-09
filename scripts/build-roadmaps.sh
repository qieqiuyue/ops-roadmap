#!/usr/bin/env bash

#
# Usage:
#   ./scripts/build-roadmaps.sh [note.md ...] [--full-template]
#
# Existing pages that use the shared-asset template are refreshed payload-only (see
# scripts/refresh-roadmap-payloads.sh). Pass --full-template to rebuild whole pages with the
# upstream builder template, which re-inlines the stylesheet/script and restores CDN URLs.
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
roadmap_builder="${LEARNING_ROADMAP_BUILDER:-${HOME}/.skills/learning-roadmap/scripts/build_roadmap.py}"

# This repository's committed pages use the shared-asset template (assets/roadmap.css and
# assets/roadmap.js with locally vendored libraries). A full builder run would re-inline the
# stylesheet/script and point the libraries back at a CDN, so existing pages are refreshed
# payload-only unless --full-template is given explicitly.
full_template=0
args=()
for arg in "$@"; do
  case "${arg}" in
    --full-template) full_template=1 ;;
    *) args+=("${arg}") ;;
  esac
done

if [[ ! -f "${roadmap_builder}" ]]; then
  echo "learning-roadmap builder not found: ${roadmap_builder}" >&2
  echo "Set LEARNING_ROADMAP_BUILDER to the build_roadmap.py path." >&2
  exit 1
fi

notes=()
if [[ "${#args[@]}" -gt 0 ]]; then
  # Validate the complete explicit selection before writing any output.
  for requested_note in "${args[@]}"; do
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
  if [[ "${full_template}" -eq 0 ]] && [[ -f "${output}" ]] && grep -q 'assets/roadmap.css' "${output}"; then
    echo "payload-only refresh: ${note#"${repo_root}/"} (pass --full-template to rebuild the whole page)" >&2
    LEARNING_ROADMAP_BUILDER="${roadmap_builder}" bash "${repo_root}/scripts/refresh-roadmap-payloads.sh" "${note}"
    continue
  fi
  python3 "${roadmap_builder}" "${note}" "${output}"
  # Link back to the repository root index.html with the depth the output file actually has
  # (notes live at topics/<category>/<note>.md or topics/<category>/<topic>/<note>.md).
  back_href="$(python3 -c 'import os, sys; print(os.path.relpath(sys.argv[1], os.path.dirname(os.path.abspath(sys.argv[2]))).replace(os.sep, "/"))' "${repo_root}/index.html" "${output}")"
  BACK_HREF="${back_href}" perl -0pi -e 's{<div class="meta">\s*}{<div class="meta">\n    <a class="back" href="$ENV{BACK_HREF}">← 返回总览</a>\n    }' "${output}"
done
