#!/usr/bin/env sh
# Assert the three places jidoka declares its version all agree.
# With a tag arg (e.g. v0.3.1), also assert they equal it.
#
#   ./scripts/check-version.sh           # are the manifests consistent?
#   ./scripts/check-version.sh v0.3.1    # ...and do they all equal 0.3.1?
#
# Source of truth is plugin.json (the field Claude Code resolves on install).
set -eu

cd "$(dirname "$0")/.."

plugin=$(jq -r .version .claude-plugin/plugin.json)
pkg=$(jq -r .version package.json)
market=$(jq -r .metadata.version .claude-plugin/marketplace.json)

expected=${1:-}
expected=${expected#v}

fail=0
check() { # label value
  if [ -n "$expected" ] && [ "$2" != "$expected" ]; then mark="✗"; fail=1
  elif [ "$2" != "$plugin" ]; then mark="✗"; fail=1
  else mark="✓"; fi
  printf '%s %-34s %s\n' "$mark" "$1" "$2"
}

check ".claude-plugin/plugin.json" "$plugin"
check "package.json" "$pkg"
check ".claude-plugin/marketplace.json" "$market"

if [ "$fail" -eq 0 ]; then
  printf '\nAll manifests agree on %s.\n' "$plugin"
  exit 0
fi

if [ -n "$expected" ]; then
  printf '\nManifests must all equal %s (the tag) — bump and re-tag.\n' "$expected" >&2
else
  printf '\nVersion drift across manifests.\n' >&2
fi
exit 1
