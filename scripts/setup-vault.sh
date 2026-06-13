#!/usr/bin/env bash
# Create the Slack vault + MCP OAuth credential. Fill slack-cred.json first (see README Step 3).
set -euo pipefail
cd "$(dirname "$0")/.."
VAULT_ID=$(ant beta:vaults create --name "sales-factory" --transform id -r)
ant beta:vaults:credentials create --vault-id "$VAULT_ID" < slack-cred.json
echo "SLACK_VAULT_ID=$VAULT_ID  >>> add to .env.local"
