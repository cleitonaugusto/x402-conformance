#!/usr/bin/env bash
# Run each adapter against every scenario, in Docker, offline except for
# loopback. Each adapter is a folder under adapters/ with its own package.json;
# this installs it if needed, then runs it.
#
# Usage: ./run-all.sh [adapters/vapi adapters/clawrouter ...]
# With no arguments, runs every adapter folder that has an adapter.mjs.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
NAME="$(basename "$PWD")"
IMAGE="node:22-bookworm-slim"

# Local HTTPS for SDKs that refuse to pay a plain-HTTP endpoint. Test-only,
# self-signed, short-lived, trusted only inside the container.
if [ ! -f tls/cert.pem ]; then
  mkdir -p tls
  openssl req -x509 -newkey rsa:2048 -nodes -keyout tls/key.pem -out tls/cert.pem -days 7 \
    -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1,DNS:localhost" 2>/dev/null
fi

adapters=("$@")
if [ ${#adapters[@]} -eq 0 ]; then
  for d in adapters/*/; do [ -f "$d/adapter.mjs" ] && adapters+=("${d%/}"); done
fi

mkdir -p results
status=0
for a in "${adapters[@]}"; do
  name="$(basename "$a")"
  echo "== $name"
  docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -e SELLER_TLS_DIR="/a/$NAME/tls" -e NODE_EXTRA_CA_CERTS="/a/$NAME/tls/cert.pem" \
    -v "$ROOT:/a" -w "/a/$NAME" "$IMAGE" sh -c "
      if [ ! -d '$a/node_modules' ]; then
        echo 'installing $name ...'
        npm --prefix '$a' install --ignore-scripts --no-audit --no-fund --loglevel=error
      fi
      timeout 900 node --import ./no-egress.mjs run.mjs '$a'
    " >"results/$name.log" 2>&1 || status=1
  grep -E "runs signed|blocked outbound" "results/$name.log" || tail -5 "results/$name.log"
done
exit $status
