#!/usr/bin/env bash
# R7B-G1B9 — offline Rust Serde test gate; never installs tools or accesses Docker.
set -Eeuo pipefail
umask 077
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
fail() { printf 'BLOCKED R7B-G1B9: %s\n' "$*" >&2; exit 42; }
expected_hash() {
  local file="$1" expected="$2" actual
  [[ -f "$file" && ! -L "$file" ]] || fail "missing or symlinked file: $file"
  actual="$(git hash-object -- "$file")" || fail "hash computation failed: $file"
  [[ "$actual" == "$expected" ]] || fail "Git blob mismatch: $file (actual $actual)"
}
command -v git >/dev/null 2>&1 || fail 'git unavailable for source-integrity checks'
expected_hash "$HERE/Cargo.toml" '5750340dcef6fd45e547dc5ef4977d7c1d429542'
expected_hash "$HERE/tests/serde_models.rs" '64ebb92d57eb572b0463845e139aea77b5790a79'
printf 'PASS: pinned Cargo manifest and Rust test source Git blobs\n'
# This gate is intentionally NOT a toolchain installer or Cargo resolver.
[[ "${R7B_RUST_OFFLINE_APPROVED:-}" == '1' ]] || fail 'explicit offline-execution flag missing'
command -v rustc >/dev/null 2>&1 || fail 'rustc unavailable; no installation attempted'
command -v cargo >/dev/null 2>&1 || fail 'cargo unavailable; no installation attempted'
[[ -s "$HERE/Cargo.lock" && ! -L "$HERE/Cargo.lock" ]] || fail 'audited standalone Cargo.lock unavailable'
[[ "${R7B_APPROVED_LOCK_SHA256:-}" =~ ^[0-9a-fA-F]{64}$ ]] || fail 'reviewed Cargo.lock SHA-256 required'
actual_lock_sha="$(sha256sum "$HERE/Cargo.lock" | awk '{print $1}')" || fail 'lock checksum calculation failed'
[[ "${actual_lock_sha,,}" == "${R7B_APPROVED_LOCK_SHA256,,}" ]] || fail 'Cargo.lock SHA-256 mismatch'
CACHE="${R7B_APPROVED_CARGO_HOME:-}"
[[ "$CACHE" == /* && -d "$CACHE" && ! -L "$CACHE" ]] || fail 'an isolated pre-populated Cargo cache path is required'
[[ "$CACHE" != "$HOME/.cargo" && "$CACHE" != "$HERE" ]] || fail 'personal Cargo home / project root is disallowed'
export CARGO_HOME="$CACHE" CARGO_NET_OFFLINE=true
TASK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/r7b-g1b9-target.XXXXXXXX")" || fail 'isolated target directory unavailable'
trap 'rm -rf -- "$TASK_DIR"' EXIT
export CARGO_TARGET_DIR="$TASK_DIR"
printf 'Running approved, locked, offline Rust tests; no Docker or network\n'
cargo test --manifest-path "$HERE/Cargo.toml" --locked --offline
printf 'PASS R7B-G1B9: compiled Rust Serde tests completed\n'
