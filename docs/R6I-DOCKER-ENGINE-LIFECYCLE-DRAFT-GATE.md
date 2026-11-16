# EXATA R24-03W R6I — Docker Engine lifecycle plans (DRAFT / OFFLINE ONLY)

Date: 2026-11-16. Public synthetic laboratory: `hlxdnapp1/f5-vector-docker-synthetic-lab`. Principal governance: [EXATA issue #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315).

**Owner authorization:** continue preparation/review in a fresh Draft branch, not Actions execution, merge, live Docker, image download, container create/start/stop/remove, Windows HML, SQL, fiscal or production.

## Pinned prior baseline

- R6H parent commit: `a34c9c57d95113b861cc329724605c89d432a58a`. Owner Windows offline **91/91 PASS**, SHA-256 of owner-local report `R24_03W_R6H_RESULT.json` reported as `656A3045C70ECF686BC6D5B503373C96FA337B869E5C07A89491CAA9A280315F`.
- Public default `main` remains `72775463905e9f81730f8f8bb5e5c054f136e6ff`. Existing R6F manual **offline-only** workflow in prior stacked Draft branch has never been executed.

## What R6I adds

1. `src/r6i-engine-operation-plan.mjs`: pure in-memory Docker Engine **operation plans**, not an HTTP client or executable. Describes exactly-scoped `GET /images/.../json`, `GET /containers/json?all=true&filters=...`, `POST /containers/create?name=...`, `GET /containers/{id}/json`, `POST /containers/{id}/start`, `POST /containers/{id}/stop?t=3` and `DELETE /containers/{id}?force=false&v=false`. These requests are **strings and JSON data only**; no code is able to send them to the Docker daemon.
2. `tests/r6i-engine-operation-plan.test.mjs`: **24** positive/negative Node tests for method/path boundaries, safe synthetic manifests, image provenance, fail-closed create/start/stop/delete planning, nonce/run/role ownership, foreign-ID rejection, uncertain POST recovery, cleanup correctness and inert source checks.
3. This review document; no previous source or workflow changes.

The sample repository/image namespace is `docker.io/library/busybox`; samples use **fabricated hashes**, never a resolved or reviewed real image digest. An independently vetted, immutable real image is **not yet selected**. The create plan specifies nonroot `10001:10001`, `NetworkMode=none`, rootfs read-only, no mounts/ports, `Privileged=false`, dropped capabilities, no-new-privileges, 64 MiB RAM, half CPU, 32 PIDs, restart policy `no` and auto-remove.

## Critical image identifier distinction

Docker has separate **manifest digest** (`RepoDigests`, `docker.io/library/busybox@sha256:...`) and **image configuration ID** (`Id: sha256:...`, also the container inspect `Image` value). They are not interchangeable. R6I plans require BOTH proofs independently, for `linux/amd64`, before any candidate create plan. This avoids falsely comparing two different hashes. [Docker Go image inspect API](https://pkg.go.dev/github.com/docker/docker/api/types/image).

## Write-ahead and uncertain results

A pure JSON journal models `PLANNED → CREATE_INTENT → NEEDS_INSPECT → ATTESTED → ACTIVE → CLEANUP_INTENT → CLEANED`. A create timeout becomes `RECOVERY_REQUIRED` and explicitly **blocks blind CREATE retry**. Recovery proposes an owner/nonce/run/role-filtered read, then verifies a single ID and full synthetic container metadata before allowing progress. Duplicate results or foreign names/labels remain `BLOCKED`. Cleanup requires recorded ID, phase and fresh matching inspect. STOP never forces removal. DELETE is proposed only for verified **stopped** containers with `force=false`; cleanup cannot be marked complete until both inspect=404 and exact owner-scoped listing count=0 are supplied. Failures produce `CLEANUP_BLOCKED`, not PASS.

**This journal is NOT DURABLE.** It returns JSON values without writing a file or performing an atomic transaction. A future live-runner implementation must persist intentions *before* requests, recover after crashes, authenticate the Docker evidence source, protect the ledger against tampering, and prove teardown by exact created ID. All current proofs are user-supplied fake JSON from offline tests, not trusted daemon results.

## Real-integration blockers exposed by research

1. **Docker logs RFC3339Nano incompatibility:** Docker adds padded 9-digit nanosecond timestamps (e.g., `2014-09-16T06:17:46.000000000Z`), while the current R6F log projector only accepts exactly **three fractional digits**. Therefore the existing R6F/R6G log parser likely rejects authentic Docker log frames. MUST fix and test this before claiming real Docker/Vector interoperability. [Official Docker logs documentation](https://docs.docker.com/reference/cli/docker/container/logs/).
2. **No true continuous Vector stream:** R6F rewrites `follow=true` to `follow=false`; R6I only describes a finite snapshot workload. Bounded authenticated streaming, backpressure, cancellation and partial-byte leakage guarantees remain unimplemented.
3. **Container inspect normalization is unproven:** Docker may normalize `SecurityOpt`, `Config.Image`, timestamps or other fields. R6G/R6I strict proof matching needs real Docker validation without allowing insecure fallback.
4. **Trusted host and image remain unverified:** GitHub-runner environment variables and synthetic labels are not cryptographic host identities. Real image digest/publisher/license must be independently verified; no image was downloaded.
5. **No live lifecycle, persistent ledger or rollback proof:** The Docker Engine, real containers and API status codes have never been exercised here. AutoRemove can race against STOP/inspect, so actual absence must be verified. The official Vector 0.53.0 real-daemon path remains UNPROVEN.
6. **No authorization for operations:** Mutating API method names in source code do not grant permission to invoke them. The public `main`, Actions, original Windows Docker and HML are protected.

Docker API shape reference: [Engine API version history](https://docs.docker.com/reference/api/engine/version-history/). GitHub public standard `ubuntu-24.04` runner use is free per [GitHub docs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job), but this review does not start any job.

## Gate status

| Gate | Status |
|---|---|
| R6H Windows combined suite | **PASS 91/91 OFFLINE** |
| R6I new focused Node test suite | **PASS 24/24 locally**; commit/tree verification required |
| R6I combined Windows suite | **PENDING 115/115** until independent owner clone |
| R6I actual Docker create/start/remove | **NOT IMPLEMENTED / BLOCKED** |
| Default branch merge and GitHub Actions | **NOT AUTHORIZED / NOT EXECUTED** |
| Original HML Vector and production | **NO-GO** |

**Central rule:** preserve approved R6H, review smaller and safer diffs, test in isolation, approve real execution separately, never touch production without backup, rollback and gates.
