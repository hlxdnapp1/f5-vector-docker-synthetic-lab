#!/usr/bin/env bash
# R7A — READ-ONLY preflight for the REAL local Docker daemon on a GitHub-hosted
# standard Ubuntu 24.04 VM. No Vector run, images, containers or daemon mutation.
set -Eeuo pipefail

fail() {
  printf 'R7A_FAIL_CLOSED=%s\n' "$1" >&2
  exit 1
}
require() {
  command -v "$1" >/dev/null 2>&1 || fail "TOOL_MISSING"
}
is_hex40() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]]
}

[[ "${GITHUB_EVENT_NAME:-}" == "workflow_dispatch" ]] || fail "EVENT_NOT_MANUAL"
[[ "${GITHUB_REPOSITORY:-}" == "hlxdnapp1/f5-vector-docker-synthetic-lab" ]] || fail "WRONG_REPO"
[[ "${GITHUB_REF:-}" == "refs/heads/main" ]] || fail "WRONG_REF"
[[ "${RUNNER_ENVIRONMENT:-}" == "github-hosted" ]] || fail "NOT_GITHUB_HOSTED"
[[ "${RUNNER_OS:-}" == "Linux" && "${RUNNER_ARCH:-}" == "X64" ]] || fail "RUNNER_PLATFORM"
[[ "${R7A_SCOPE:-}" == "HOST_READONLY_ONLY" ]] || fail "SCOPE_NOT_APPROVED"
is_hex40 "${GITHUB_SHA:-}" || fail "INVALID_GITHUB_SHA"
is_hex40 "${R7A_REVIEWED_COMMIT:-}" || fail "INVALID_REVIEWED_COMMIT"
[[ "$GITHUB_SHA" == "$R7A_REVIEWED_COMMIT" ]] || fail "COMMIT_NOT_MATCHING_REVIEWED"
[[ "${GITHUB_REPOSITORY_VISIBILITY:-}" == "public" ]] || fail "REPOSITORY_NOT_PUBLIC"

# Reject any hint of a Docker remote endpoint or client context override.
for setting in DOCKER_HOST DOCKER_CONTEXT DOCKER_CONFIG DOCKER_TLS_VERIFY \
               DOCKER_CERT_PATH DOCKER_API_VERSION; do
  [[ -z "${!setting:-}" ]] || fail "DOCKER_ENV_OVERRIDE_PRESENT"
done

require uname
require lsb_release
require docker
require timeout
require awk
require df
require nproc

[[ "$(uname -s)" == "Linux" && "$(uname -m)" == "x86_64" ]] || fail "HOST_NOT_X64_LINUX"
[[ "$(lsb_release -rs)" == "24.04" ]] || fail "RUNNER_NOT_UBUNTU_2404"
(( $(nproc) >= 2 )) || fail "RUNNER_CPU_TOO_SMALL"
[[ -S /var/run/docker.sock ]] || fail "LOCAL_UNIX_SOCKET_MISSING"

context="$(timeout 12s docker context show)" || fail "CONTEXT_READ_FAILED"
[[ "$context" == "default" ]] || fail "CONTEXT_NOT_DEFAULT"
endpoint="$(timeout 12s docker context inspect default --format '{{.Endpoints.docker.Host}}')" \
  || fail "CONTEXT_ENDPOINT_READ_FAILED"
[[ "$endpoint" == "unix:///var/run/docker.sock" ]] || fail "NONLOCAL_DOCKER_ENDPOINT"

os="$(timeout 12s docker info --format '{{.OSType}}')" || fail "DOCKER_INFO_FAILED"
arch="$(timeout 12s docker info --format '{{.Architecture}}')" || fail "DOCKER_ARCH_FAILED"
[[ "$os" == "linux" ]] || fail "DOCKER_NOT_LINUX"
[[ "$arch" == "x86_64" || "$arch" == "amd64" ]] || fail "DOCKER_ARCH_NOT_AMD64"

version="$(timeout 12s docker version --format '{{.Server.Version}}')" \
  || fail "DOCKER_VERSION_FAILED"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9._-]+)?$ ]] \
  || fail "INVALID_DOCKER_SERVER_VERSION"

free_kb="$(df -Pk "${HOME}" | awk 'NR==2 {print $4}')" || fail "DISK_READ_FAILED"
[[ "$free_kb" =~ ^[0-9]+$ ]] || fail "DISK_VALUE_INVALID"
(( free_kb >= 4194304 )) || fail "RUNNER_DISK_BELOW_4_GIB"

memory_kb="$(awk '$1 == "MemAvailable:" {print $2}' /proc/meminfo)" \
  || fail "MEMORY_READ_FAILED"
[[ "$memory_kb" =~ ^[0-9]+$ ]] || fail "MEMORY_VALUE_INVALID"
(( memory_kb >= 3145728 )) || fail "RUNNER_MEMORY_BELOW_3_GIB"

# Read-only collision check; never enumerate names in the public CI log.
collision_count="$(timeout 12s docker ps --all --filter 'label=f5.synthetic.lab=R7A_ONLY' \
  --format '{{.ID}}' | awk 'END {print NR}')"
[[ "$collision_count" == "0" ]] || fail "STALE_R7A_FIXTURE_DETECTED"

printf '%s\n' 'R7A_HOST_DOCKER_REAL_READONLY=PASS'
printf '%s\n' 'RUNNER=GITHUB_HOSTED_UBUNTU_2404_X64'
printf '%s\n' 'DOCKER_ENDPOINT=LOCAL_UNIX_SOCKET'
printf 'DOCKER_ENGINE_VERSION=%s\n' "$version"
printf '%s\n' 'DOCKER_MUTATIONS=0'
printf '%s\n' 'VECTOR_BINARY=NOT_EXECUTED'
printf '%s\n' 'SYNTHETIC_CONTAINERS=NOT_CREATED'
printf '%s\n' 'BROKER_MTLS=NOT_IMPLEMENTED'
printf '%s\n' 'STREAMING_FOLLOW_TRUE=NOT_TESTED'
printf '%s\n' 'EXATA_HML_AND_PRODUCTION=NO_GO'
