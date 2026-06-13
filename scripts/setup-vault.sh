#!/usr/bin/env bash
# Create (or reuse) the Slack vault + add the MCP OAuth credential.
# Fill slack-cred.json first (see slack-cred.example.json). Requires jq + ant >= 1.12.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f slack-cred.json ]; then
  echo "ERROR: slack-cred.json missing. cp slack-cred.example.json slack-cred.json and fill it." >&2
  exit 1
fi

# Reuse SLACK_VAULT_ID from .env.local if already set, else create a new vault.
VAULT_ID=$(grep -E '^SLACK_VAULT_ID=' .env.local 2>/dev/null | cut -d= -f2- | tr -d '"' | xargs || true)
if [ -z "${VAULT_ID:-}" ]; then
  VAULT_ID=$(ant beta:vaults create --display-name "sales-factory" | jq -r '.id')
  echo "Created vault: $VAULT_ID"
else
  echo "Reusing vault: $VAULT_ID"
fi

# v1.12 takes auth as repeated --auth key=value (nested objects passed as JSON).
ant beta:vaults:credentials create \
  --vault-id "$VAULT_ID" \
  --display-name "$(jq -r '.display_name' slack-cred.json)" \
  --auth type="$(jq -r '.auth.type' slack-cred.json)" \
  --auth mcp_server_url="$(jq -r '.auth.mcp_server_url' slack-cred.json)" \
  --auth access_token="$(jq -r '.auth.access_token' slack-cred.json)" \
  --auth refresh="$(jq -c '.auth.refresh' slack-cred.json)"

echo "SLACK_VAULT_ID=$VAULT_ID  >>> already written to .env.local"
