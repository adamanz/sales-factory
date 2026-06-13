#!/usr/bin/env bash
# Create the environment + coordinator + subagents via the Anthropic CLI (ant).
# Run once; writes the IDs back into .env.local. Requires ANTHROPIC_API_KEY (or `ant auth login`)
# and SLACK_MCP_URL set in .env.local.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env.local; set +a

envsubst < agents/sales-factory.agent.yaml > /tmp/coordinator.yaml
ENV_ID=$(ant beta:environments create < agents/environment.yaml --transform id -r)
for f in quote deck order research; do
  ant beta:agents create < <(envsubst < agents/$f.agent.yaml) >/dev/null
done
# Re-create coordinator after subagents exist (roster references them by name/latest)
AGENT_ID=$(ant beta:agents create < /tmp/coordinator.yaml --transform id -r)

echo "SALES_FACTORY_ENV_ID=$ENV_ID"
echo "SALES_FACTORY_AGENT_ID=$AGENT_ID"
echo ">>> add those two to .env.local"
