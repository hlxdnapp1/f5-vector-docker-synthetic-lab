# EXATA R7B-G1B — First offline Docker EVENTS/LOGS safety boundary

**Date:** 2026-11-16. **Governance:** [EXATA issue #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Repository:** `hlxdnapp1/f5-vector-docker-synthetic-lab`, public synthetic-only research lab.

## 1. Deliverables and exact provenance

Starting base: public protected `main=af1a5bfd2e6ed753fb68f4622e893947a9dab919`. This work extends the [R7B-G1A Draft PR #28](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/28) **without merging or dispatching**.

- `src/r7b-bounded-synthetic-stream.mjs`: original pure in-memory incremental parser for synthetic Docker `EVENTS` (newline-delimited JSON) and `LOGS` (8-byte multiplexed stdout/stderr frames), no imported modules or network/Docker filesystem interfaces.
- `tests/r7b-bounded-synthetic-stream.test.mjs`: 26 native Node tests for both protocol forms, fragmentation, identity, bounded buffering, synthetic data projection and negative failure paths.
- `docs/R7B-G1B-OFFLINE-SYNTHETIC-BOUNDARY-VALIDATION.md`: this evidence and authorization boundary.
- Previous `docs/R7B-G1A-VECTOR-REAL-SYNTHETIC-RUNTIME-APPROVAL-GATE.md` remains preserved unchanged.

**Exact bytes** of the two executable/test files were built in a fresh local isolated directory and then written to GitHub; the downloaded Git blob SHAs match the local `git hash-object` results:

| File | Git blob SHA-1 | Local SHA-256 |
| --- | --- | --- |
| `src/r7b-bounded-synthetic-stream.mjs` | `8a4b3736954d599355f309f1a766d88045cd9c20` | `09419c24b055b159d53c21219ff787feed8365e41536681e201caf8aa6ee4b58` |
| `tests/r7b-bounded-synthetic-stream.test.mjs` | `eef38b2e4a0f2bf7a54396fc78cd5c3e63f07418` | `6d936e85eae2f093c3cfcc9ac0d1d2ecce25cbd1e7f9ad0495531cf84a0139cc` |

## 2. Safety property actually tested

The parser is **NOT** a real transport, HTTP gateway, TLS handler, Docker client, live Vector collector or production sanitizer. It accepts **only a fixed public synthetic ID and marker**. It intentionally rejects arbitrary client/application logs and all outsider events.

- `EVENTS`: accepts only precise keys `Type/Action/Actor/time/timeNano`, Type `container`, Action `start|die`, synthetic 64-char fake ID `a...`, `Actor.Attributes.name='r7b-synthetic-fixture'` and time/timeNano consistency. It reconstructs a safe allowlisted event, never forwards raw JSON.
- `LOGS`: accepts stdout/stderr channels `1|2`, zero reserved bytes and payload length `1..512`, strict UTF-8, valid UTC RFC3339(0–9 fractional digits) plus exact `R7B_PUBLIC_SYNTHETIC_ONLY` marker and newline. It re-encodes frames; malformed times, arbitrary text or poisoned mux headers fail closed.
- Complete records inside one `push` are validated before any new frame can become visible. Earlier frames already returned by previous pushes cannot be retroactively withdrawn.
- Max input chunk **2,048 bytes**, total **65,536 bytes**, max **100 records**, at most **8 pending frames**, bounded carry buffer, conservative `BACKPRESSURE` without accepting any further data and cancellation that clears internally owned buffers.
- Truncated header/frame/event at EOF fails; invalid UTF-8 and partial foreign records are never silently released. No plaintext raw input passes into output under the synthetic contract.

## 3. Test evidence (native local Node, not GitHub Actions)

- Local Node.js: **v22.16.0**.
- `node --check` on both files: **PASS**.
- `node --test --test-reporter=spec tests/r7b-bounded-synthetic-stream.test.mjs`: **26/26 PASS**, 0 failed, 0 skipped, 0 cancelled.
- Static review: **6/6 PASS**, no `import`, Docker socket, `fetch`, `spawn` or server-creation primitives in source; exact synthetic-only marker present.
- File contents and blob hashes cross-checked against GitHub after upload, no drift.
- Prior unrelated `R7A-G0C` real Docker **read-only** PASS remains valid, but **does not apply to execution of this parser in Docker**.

Tests here use **owned in-memory Buffers**, not an upstream network socket. `BACKPRESSURE` is a finite pull queue limit, **not** verified TCP/HTTP flow control. This model cannot prove indefinite `follow=true`, streaming connection teardown, Node Writable `drain`, TLS pinning, Vector 0.53.0 parser acceptance, full native Docker event fields, safe sandbox lifecycle, daemon identity, real container filtering or rolling recovery.

A future live adapter must be independently designed and gated. It must implement active upstream pause/resume, time and byte quotas, context cancellation, per-request tenant/ID authorization and source revocation, stream-level failure handling, mTLS SAN/fingerprint validation, and pre-emission sanitization without bypass.

## 4. Approval gates

| Gate | State |
| --- | --- |
| R7A-G0A/G0B/G0C | **PASS** — R7A publish + Docker host read-only on GitHub public runner |
| R7B-G1A | **PASS DRAFT REVIEW** — architecture approved for continued study only |
| R7B-G1B | **PASS OFFLINE ONLY** — 26/26 native tests and Git blob integrity |
| R7B-G1C | **BLOCKED** — publishing additional code/workflows on `main` requires separate authorization |
| R7B-G1D | **BLOCKED** — executing Docker mutating commands, downloads/images/fixtures requires another explicit authorization |
| R7C-G2 | **NOT IMPLEMENTED** — real Vector 0.53, mTLS, endless `follow=true`, sandboxed controller |
| EXATA Windows, HML, production | **NO-GO / untouched** |

This PR is deliberately **Draft**. No commands, workflow or image pulls were used in this phase. No new secrets, fees, SQL or Windows operations. No claim of recovery of either stopped Vector.