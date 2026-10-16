#!/bin/sh
# Read-only public routing check; deliberately unauthenticated, never follows redirects.
set -eu
base=${1:-https://cityusbdisk.cn}
for path in '/api/v1/cad/extracts' '/api/v1/cad/extracts?limit=3' '/api/v1/cad/extracts?limit=20' '/api/v1/cad/extracts/' '/api/v1/cad/extracts/?limit=20' '/api/v1/cad/extracts/proxy-check'; do
    code=$(curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' "$base$path")
    printf '%s %s\n' "$code" "$path"
    [ "$code" = 401 ] || exit 1
done
code=$(curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' "$base/api/v1/health")
printf '%s /api/v1/health\n' "$code"
[ "$code" = 200 ]
