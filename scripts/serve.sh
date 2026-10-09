#!/usr/bin/env bash
#
# Serve the repository over HTTP for local reading.
#
# Why not plain `python3 -m http.server`?
#   It answers with e.g. `Content-type: text/markdown` and no charset. Browsers then fall back
#   to the operating-system default encoding, so `topics/**/README.md` and other Markdown links
#   show up as mojibake on systems whose default is not UTF-8 (for example Chinese Windows).
#   This wrapper always appends `charset=utf-8` to text-ish responses, and disables caching so
#   edits show up on reload.
#
# Usage:
#   ./scripts/serve.sh [port]      # default 8000
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${1:-8000}"
cd "${repo_root}"

exec python3 - "${port}" <<'PY'
import http.server
import sys

port = int(sys.argv[1])


class Handler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        ctype = super().guess_type(path)
        textish = ctype.startswith("text/") or ctype in (
            "application/javascript",
            "application/json",
            "application/xml",
            "image/svg+xml",
        )
        if textish and "charset=" not in ctype:
            ctype = f"{ctype}; charset=utf-8"
        return ctype

    def end_headers(self):
        # Local reading: always revalidate so a saved file shows up on reload.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


with Server(("127.0.0.1", port), Handler) as httpd:
    print(f"Ops Roadmap: http://127.0.0.1:{port}/  (Ctrl+C to stop)", flush=True)
    httpd.serve_forever()
PY
