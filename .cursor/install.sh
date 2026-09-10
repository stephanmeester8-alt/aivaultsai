#!/usr/bin/env bash
#
# AIVaultsAI Cloud Agent install script.
#
# Runs from the repository root after checkout. Must be idempotent: it can run
# repeatedly against cached or partially prepared state.
#
# Responsibilities:
#   1. Provide Node >= 22.18 as the default `node`, so that
#      `packages/agent-core` runs `node --test ./test/*.ts` unchanged
#      (native TypeScript type stripping is only on-by-default from 22.18).
#   2. Install the Next.js web app dependencies from its lockfile.
#
# `packages/agent-core` has no dependencies and no lockfile, so it needs no
# install step of its own.

set -euo pipefail

# ---------------------------------------------------------------------------
# 1. Node runtime
#
# The default Cloud Agent image exposes Node 22.14 first on PATH (a bundled
# shim in /exec-daemon), which does not strip TypeScript types by default.
# We install Node 24 through the image's nvm and expose it ahead of that shim
# by symlinking into the first writable PATH entry.
# ---------------------------------------------------------------------------

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "ERROR: nvm was not found at $NVM_DIR; cannot provision Node 24." >&2
  exit 1
fi

# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"

nvm install 24 >/dev/null
node24_dir="$(dirname "$(nvm which 24)")"

# Pick the first PATH directory as the override location. On the Cloud Agent
# image this is /usr/local/cargo/bin, which is ordered ahead of the bundled
# Node shim, so these symlinks win for every shell the agent uses.
override_dir="$(printf '%s' "$PATH" | cut -d: -f1)"
mkdir -p "$override_dir"

for bin in node npm npx corepack; do
  if [ -x "$node24_dir/$bin" ]; then
    ln -sf "$node24_dir/$bin" "$override_dir/$bin"
  fi
done

echo "Using node $(node -v) from $(command -v node)"

# Fail fast if the override did not take effect.
node -e 'const [maj, min] = process.versions.node.split(".").map(Number); if (maj < 22 || (maj === 22 && min < 18)) { console.error("Node >= 22.18 required for TypeScript type stripping, found " + process.versions.node); process.exit(1); }'

# ---------------------------------------------------------------------------
# 2. Web application dependencies
# ---------------------------------------------------------------------------

( cd apps/web && npm ci )

echo "Install complete."
