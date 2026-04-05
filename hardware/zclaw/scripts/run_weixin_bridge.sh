#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${ZCLAW_WEIXIN_ENV_FILE:-$SCRIPT_DIR/weixin.local.env}"

if [ ! -f "$ENV_FILE" ]; then
    echo "Missing env file: $ENV_FILE" >&2
    exit 1
fi

set -a
source "$ENV_FILE"
set +a

exec node "$PROJECT_DIR/weixin_bridge.mjs" "$@"
