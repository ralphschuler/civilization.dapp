#!/usr/bin/env bash
# Slither intentionally is not an npm dependency: local assurance must fail
# clearly when the separately pinned analyzer/compiler have not been installed.
set -euo pipefail

SOLC_VERSION="0.8.30+commit.73712a01"
SOLC_BINARY="${SOLC_BINARY:-solc}"
SLITHER_VERSION="0.11.3"

if ! command -v slither >/dev/null 2>&1; then
  echo "security:slither requires slither-analyzer==$SLITHER_VERSION; see docs/SECURITY_ASSURANCE.md" >&2
  exit 127
fi

if ! slither_version_output="$(slither --version 2>&1)"; then
  echo "security:slither could not read the local slither version; requires slither-analyzer==$SLITHER_VERSION" >&2
  exit 1
fi

# `slither --version` normally emits one bare semantic-version line. Parse the
# complete output so an error message or an additional version cannot be
# mistaken for the installed analyzer version.
slither_version=""
while IFS= read -r slither_version_line; do
  slither_version_line="${slither_version_line%$'\r'}"
  if [[ "$slither_version_line" =~ ^[[:space:]]*([0-9]+\.[0-9]+\.[0-9]+)[[:space:]]*$ ]]; then
    if [[ -n "$slither_version" ]]; then
      slither_version=""
      break
    fi
    slither_version="${BASH_REMATCH[1]}"
  elif [[ -n "$slither_version_line" ]]; then
    slither_version=""
    break
  fi
done <<< "$slither_version_output"

if [[ "$slither_version" != "$SLITHER_VERSION" ]]; then
  received_version="${slither_version:-unparseable}"
  echo "security:slither refuses an unpinned analyzer; expected slither-analyzer==$SLITHER_VERSION, got $received_version" >&2
  exit 1
fi

if ! command -v "$SOLC_BINARY" >/dev/null 2>&1; then
  echo "security:slither requires SOLC_BINARY (or solc) version $SOLC_VERSION; see docs/SECURITY_ASSURANCE.md" >&2
  exit 127
fi
if ! "$SOLC_BINARY" --version | grep -Fq "$SOLC_VERSION"; then
  echo "security:slither refuses an unpinned Solidity compiler; expected $SOLC_VERSION" >&2
  exit 1
fi

fixture_filter="$(node scripts/solidity-scope.mjs --fixture-filter)"
release_solc_args="$(node scripts/solidity-release-profile.mjs --solc-args)"

slither contracts/src \
  --solc "$SOLC_BINARY" \
  --solc-remaps "@openzeppelin/=node_modules/@openzeppelin/" \
  --solc-args "$release_solc_args" \
  --exclude-dependencies \
  --filter-paths "node_modules/|$fixture_filter" \
  --exclude "weak-prng,incorrect-equality,uninitialized-local,reentrancy-events,timestamp,assembly,pragma,dead-code,solc-version,low-level-calls,missing-inheritance,costly-loop,cache-array-length"
