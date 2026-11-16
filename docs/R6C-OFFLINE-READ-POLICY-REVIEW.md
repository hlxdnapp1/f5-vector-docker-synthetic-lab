# R6C — Offline synthetic Docker read-policy review

**Status: review candidate. No Docker daemon, socket, container, GitHub Actions workflow or cloud runner has been used in R6C.**

## What changed

This stacked branch adds an original, independent, **pure function** at `tests/synthetic-read-policy.mjs` and 13 offline Node tests at `tests/synthetic-read-policy.test.mjs`. It does not copy private ERP source, client data, Docker YAML, secrets, real IDs or production configuration.

The policy tests only **synthetic** request shapes supplied as ordinary JavaScript values. It allows the known fake 64-character `aaaaaaaa...` container ID and denies the synthetic `bbbbbbbb...` outsider ID. It recognizes `GET /_ping`, `GET /version`, `GET /containers/json` with `all=false` and JSON-object filters, `GET /events`, `GET /containers/{fake-id}/json` and `GET /containers/{fake-id}/logs`. It supports an optional, strictly scoped `/v1.40` through `/v1.59` API prefix and Bollard unversioned request path.

For logs, `tail=all` is only **classified** into a bounded verdict of 100; numerical tails over 100, duplicate/unknown parameters, non-GET methods, unrelated routes and outsider IDs are rejected. The output is a finite categorical verdict, **not a forwarded request**. No network or filesystem I/O is performed by the policy.

## Proof boundaries

- An offline Node test proves only that the function gives the expected verdict on supplied input cases.
- This is **not** an HTTP server, TLS/mTLS implementation, daemon proxy, Docker authorization control or stream parser.
- No response scrubbing exists here. A real Docker `LIST`, `INSPECT`, `EVENTS` or `LOGS` response could expose unauthorized data unless a separately designed response filter is proven. Request classification **alone must never be connected to a real daemon**.
- The `tail` value returned in a verdict does **not** limit real logs by itself; a separately tested gateway must enforce this on its outgoing Docker call and streaming body.
- Docker's HTTP API can grant privileged operations; the future real adapter must be fail-closed, enforce route, method, container identity and response filtering, and never expose the daemon socket or TLS key to arbitrary code.
- No decision about original Windows Server `host.docker.internal:2375`, old Vector containers, HML/production configuration or restoration follows from these tests.
- GitHub-hosted standard `ubuntu-24.04` in a public repository is a future option, not activated by this branch.

## Review / next gates

1. Verify original public code and tree, exact commit, hashes, no secret values and zero `.github/workflows` files.
2. Run `node --test` with Node >=20 in an isolated checkout; retain test output with commit/branch/sha and no private logs.
3. Do an independent threat-model and review **before building a real daemon adapter**; test request and **response** boundaries with a fake local socket, not real Docker.
4. Verify a true GitHub-hosted standard runner, budget assumptions and permissions before authorizing any workflow.
5. Get separate written owner approval for any Actions YAML, actual GitHub-hosted execution, Docker daemon connection, image pull/container creation, HML or production changes. This review does not imply that approval.

Reference: [Docker Engine API logs](https://docs.docker.com/reference/api/engine/version/v1.51/#tag/Container/operation/ContainerLogs); [GitHub-hosted runners](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job).

**Governance:** `R6B_PUBLIC_REVIEW=PASS` per owner, `R6C_SYNTHETIC_POLICY=REVIEW_PENDING`, `R6_REAL_DOCKER=BLOCKED`, `HML/PRODUCTION=NO-GO`.
