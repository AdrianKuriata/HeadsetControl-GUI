#!/usr/bin/env bash
#
# Build upstream `headsetcontrol` from master into $1, and refuse to hand back a
# binary that would damage an Audeze.
#
# Released 4.1.0 sends a parameter-setting packet on every info read, which
# permanently shifts a Maxwell's audio balance (Sapd/HeadsetControl#561). The
# fix, #577, landed after the tag. Until it ships, `make dev` against a packaged
# binary sends that packet every refresh tick — see ADR 0016.
#
# Delete this script and its targets once the fix is in a release the version
# gate accepts.
set -euo pipefail

DEST=${1:?usage: upstream-headsetcontrol.sh <dir>}
REPO=https://github.com/Sapd/HeadsetControl
# The packet #577 removed. Present in 4.1.0 and older, in both Maxwell drivers.
PACKET='0x25, 0x00, 0x7A'

if [ -d "$DEST/.git" ]; then
  git -C "$DEST" fetch --quiet origin master
else
  git clone --quiet --depth 50 "$REPO" "$DEST"
  git -C "$DEST" fetch --quiet origin master
fi
git -C "$DEST" -c advice.detachedHead=false checkout --quiet FETCH_HEAD

if grep -rq "$PACKET" "$DEST/lib/devices/"audeze_maxwell*.hpp; then
  echo "upstream master still carries the DSP write packet — refusing to build." >&2
  echo "Check whether Sapd/HeadsetControl#577 was reverted before using this." >&2
  exit 1
fi

cmake -S "$DEST" -B "$DEST/build" -DCMAKE_BUILD_TYPE=Release > /dev/null
cmake --build "$DEST/build" -j"$(nproc)" > /dev/null

"$DEST/build/headsetcontrol" --version
