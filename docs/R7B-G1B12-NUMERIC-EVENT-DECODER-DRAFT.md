# EXATA R7B-G1B12 — synthetic numeric event decoder (draft gate)

Repo: `hlxdnapp1/f5-vector-docker-synthetic-lab`; PR Draft #28; governance `hlxdnapp1/Sistema_Automacao_Comercial#315`.

## Scope
New files only:
- `src/r7b-vector053-numeric-event-decoder.mjs`
- `tests/r7b-vector053-numeric-event-decoder.test.mjs`
- `docs/R7B-G1B12-NUMERIC-EVENT-DECODER-DRAFT.md`

The historic parser `src/r7b-bounded-synthetic-stream.mjs` remains unchanged. No Docker/Vector executable, network transport, Windows container, SQL, fiscal execution, HML or production changes. No workflow dispatch or merge.

## Decoder contract
- Accepts **only** the exact canonical JSON line of the fixed, publicly owned synthetic G1B5 generator: Type `container`, four actions `start/unpause/die/pause`, synthetic ID `a` repeated 64 times, `r7b-synthetic-fixture` name and `r7b.lab.owner=LAB_ONLY` label.
- Captures `timeNano` as raw JSON integer digits and validates using `BigInt`; no `JSON.parse` Number precision loss. Returns exact decimal string and bounded subsecond nanoseconds; enforce `2 <= time <= 2147483647` and signed int64 `timeNano` range, matching whole seconds.
- Bounded in-memory NDJSON: 2048-byte max push, 768-byte max record, 65,536-byte lifetime input budget, 100-record max and 8 queued records. Reject malformed/duplicate/foreign/oversized records, incomplete final lines and invalid UTF-8. A push containing both valid and invalid records fails atomically. Backpressure does not consume the rejected input.
- This is **not** a general-purpose parser for arbitrary Docker daemon or Vector input; rigid canonical field ordering is intentional for synthetic fixtures.

## Verification gates
- Source and test blobs created in GitHub for a future isolated Draft-only commit.
- The new test suite includes direct integration with the unchanged G1B5 generator; it must be run on the **exact commit bytes** before G1B12 can receive PASS.
- Local automated execution of G1B12 in this continuation session: **NOT RUN**. The container's `git ls-remote` failed DNS resolution for github.com; do not infer test success from authored test code.
- G1B11 prior result: 158/158 Node PASS (historical gate, **not rerun**).
- G1B10 prior result: 12/12 Rust/Serde PASS (historical GitHub Actions run 44125765866, **not rerun**).

## Required next evidence
1. Verify GitHub HEAD, main, three exact file blobs, and added-only PR diff.
2. On a fresh isolated Windows clone pinned to exact G1B12 commit, run `node --check`, the new test suite and the four prior Node regression suites in one process.
3. Record counts, TAP SHA-256, exact Node version, exit code, and artifact hashes in governance #315. **Only after green evidence** change gate to PASS.

**Gate:** `R7B_G1B12_CODE=STAGED_DRAFT`, `R7B_G1B12_TESTS=BLOCKED_NOT_RUN`, `PR28_MERGE=NO_GO`, `DOCKER_REAL_VECTOR_MTLS=NO_GO`, `EXATA_WINDOWS_HML_PRODUCTION=INTACT`.
