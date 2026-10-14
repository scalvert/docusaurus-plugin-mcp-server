#!/usr/bin/env bash
# Runs the local server the setup guide has the agent create (mcp-server.mjs,
# port 3456) and checks it: the status GET, then a docs_search tool call that
# finds the site's own intro page.
set -u
[ -f mcp-server.mjs ] || { echo "mcp-server.mjs is missing"; exit 1; }

# Something already on the port would answer in place of the agent's server.
if curl -s -o /dev/null http://localhost:3456/; then
  echo "Port 3456 was already in use before the check; stop what's on it:"
  lsof -nP -iTCP:3456 -sTCP:LISTEN
  exit 1
fi

node mcp-server.mjs > .eval/mcp-server.log 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null' EXIT

up=1
for _ in $(seq 1 50); do
  if curl -sf http://localhost:3456/ > .eval/status.json; then up=0; break; fi
  sleep 0.2
done
[ $up -eq 0 ] || { echo "The server didn't answer on http://localhost:3456"; cat .eval/mcp-server.log; exit 1; }
kill -0 $pid 2>/dev/null || { echo "mcp-server.mjs exited:"; cat .eval/mcp-server.log; exit 1; }
cat .eval/status.json; echo

curl -sf http://localhost:3456/ \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"docs_search","arguments":{"query":"tutorial intro"}}}' \
  > .eval/search.json || { echo "docs_search failed"; exit 1; }
grep -q 'Found [1-9]' .eval/search.json || { echo "docs_search found nothing:"; cat .eval/search.json; exit 1; }
echo "docs_search answered"
