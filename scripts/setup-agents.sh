#!/usr/bin/env bash
# Create the environment + coordinator + subagents via the Anthropic CLI (ant).
# Run once; writes the IDs back into .env.local. Requires ANTHROPIC_API_KEY (or `ant auth login`)
# and SLACK_MCP_URL set in .env.local.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env.local; set +a

if [ -z "${SLACK_MCP_URL:-}" ]; then
  echo "ERROR: SLACK_MCP_URL not set in .env.local" >&2
  exit 1
fi

ENV_ID=$(ant beta:environments create < agents/environment.yaml --transform id -r)
echo "Created environment: $ENV_ID"

declare -a SUBAGENT_IDS=()
for f in quote deck order research; do
  id=$(envsubst < "agents/$f.agent.yaml" | ant beta:agents create --transform id -r)
  SUBAGENT_IDS+=("$id")
  echo "Created $f agent: $id"
done

COORD_YAML=$(mktemp)
envsubst < agents/sales-factory.agent.yaml > "$COORD_YAML"
python3 - "$COORD_YAML" "${SUBAGENT_IDS[@]}" <<'PY'
import sys

path, *ids = sys.argv[1:]
lines = open(path).read().splitlines()
out = []
skip = False
for line in lines:
    if line.strip() == "agents: [quote, deck, order, research]":
        out.append("  agents:")
        for agent_id in ids:
            out.append("    - type: agent")
            out.append(f"      id: {agent_id}")
        skip = False
        continue
    if skip:
        continue
    out.append(line)

open(path, "w").write("\n".join(out) + "\n")
PY

AGENT_ID=$(ant beta:agents create < "$COORD_YAML" --transform id -r)
rm -f "$COORD_YAML"
echo "Created coordinator: $AGENT_ID"

touch .env.local
for kv in "SALES_FACTORY_ENV_ID=$ENV_ID" "SALES_FACTORY_AGENT_ID=$AGENT_ID"; do
  key="${kv%%=*}"
  if grep -q "^${key}=" .env.local; then
    sed -i '' "s|^${key}=.*|${kv}|" .env.local
  else
    printf '\n%s\n' "$kv" >> .env.local
  fi
done

echo "Wrote SALES_FACTORY_ENV_ID and SALES_FACTORY_AGENT_ID to .env.local"
