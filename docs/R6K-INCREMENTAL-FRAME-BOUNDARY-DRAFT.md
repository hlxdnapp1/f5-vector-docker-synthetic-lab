# EXATA R24-03W R6K — Bounded incremental Docker log framing (OFFLINE DRAFT)

**Date:** 2026-11-16. **Principal governance:** [private EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Separate public synthetic lab:** `hlxdnapp1/f5-vector-docker-synthetic-lab`.

## Authorization boundary

Only **prepare/review offline code in a new public Draft PR**. No merge to `main`, GitHub Actions dispatch, real Docker socket/daemon, image pull, container lifecycle, SQL, fiscal operations, Windows HML services or production. Do not reclassify these tests as Docker/Vector interoperability.

Parent R6J at `d1c0c99a8cb5274fe771b2655bdbc788b9978111` independently passed **131/131 Node tests on owner's Windows**, report `R24_03W_R6J_RESULT.json`, owner-reported SHA256 `A807FFF7A3D8401E0F58CC2454E5ED80215DB3E1B46E13000310A9C480367FE2` (bytes not available for independent rehash). The public default `main` must remain at `72775463905e9f81730f8f8bb5e5c054f136e6ff`.

## Files and implementation

1. `src/r6k-bounded-docker-frame-decoder.mjs`: original, in-memory **pull-based** Docker multiplexed frame parser. Never imports filesystem/network/process modules, opens a socket, starts a server, invokes Docker or writes data. `push(Buffer)` accepts 1–2,048-byte chunks and assembles the Docker stdout/stderr 8-byte frame header and at most 512-byte text payload. Supports headers split at every byte and body fragmentation.
2. Each complete frame must contain a valid UTC-Z timestamp with 0–9 fractional digits, a literal space, the **exact marker** `R6F_PUBLIC_SYNTHETIC_ONLY` and one newline. Strict UTF-8, valid round-trip calendar date, channel 1 or 2, reserved zero bytes and bounded payload are enforced. The decoder **re-encodes a fresh safe marker-only frame**, never returns original unvalidated frame bytes or arbitrary incoming text.
3. Queue holds at most **8 validated frames**. `take(limit)` returns **copies** to the caller. Once queue is full, `push` refuses more input with `R6K_BLOCKED_BACKPRESSURE`; caller must first drain. Total input <=65,536 bytes and <=100 frames, buffered bytes <=4,096, no individual push above 2,048 bytes. `finish()` fails closed if header/payload ends incomplete. `cancel()` discards and zeroes private buffered/pending bytes, while status reports only counts and state.
4. `tests/r6k-bounded-docker-frame-decoder.test.mjs`: **24 Node native tests**: single-byte splits, every split point, nine-digit nanoseconds, earlier precision, invalid marker/date/UTF-8/channel/headers/length, truncated streams, two-frame chunk boundaries, atomic rejection **within a push**, pull-queue backpressure/draining, max 100 frames, frame 101 denial, cancel, invalid input, post-end guards and static no-I/O check. No mocks from the private ERP are copied.
5. No other file is changed. In particular, the existing R6F manual offline workflow remains unchanged and cannot run from a Draft branch via `workflow_dispatch`.

## Test evidence and proof limits

- Locally executed **Node.js v22.16.0, 24/24 PASS**, no failed/skipped/cancelled tests. Both final source and test files were tested **in their final GitHub path layout** and hashed via `git hash-object`; GitHub blob hashes must match before review.
- Previously approved R6J Windows 131/131 PASS persists; **R6K full combined 155/155 on the exact published R6K commit is PENDING independent Windows validation**, not a new PASS claim.
- The decoder is a **pure pull-based model, not Node stream.Transform, not a transport adapter, not integrated into a TLS gateway or a Docker HTTP GET**. It has no actual upstream pause/resume or network backpressure. It can emit a **validated safe frame** before a *later* frame fails; it cannot roll back already consumed safe frames. It does not promise transaction-wide atomicity across separate `push` calls.
- The decoder only recognizes exact synthetic markers; it deliberately **cannot process arbitrary real application logs**. A real Vector collector needs approved response filtering without leaking untrusted data, protocol negotiation, continuous `follow=true` with cancellation, true stream backpressure, timeouts, restart/replay semantics, and isolation.
- Node Docker `stdcopy` multiplexed framing is assumed for `Tty=false` containers. Actual Docker API may emit framing/segmentation/timezones requiring validation on a **genuinely isolated daemon**, separately authorized. No proof of Vector 0.53.0 compatibility, daemon identity, digest-pinned real image, persistent ownership ledger, cleanup or rollback is supplied.
- No CRON, worker, workflow modification, main merge, Docker/Vector process, Windows or HML operation has been attempted.

## Future gates

1. Independently validate fresh Windows clone at exact commit: branch/parent/tree/diff/Git blob checks; native Node **155/155 PASS**, clean checkout; report SHA-256.
2. Independent protocol/security review of timeout, backpressure, chunk splitting and cancellation under realistic stream conditions, without leaking raw frames.
3. Implement and test a separate hosted-runner adapter and durable exact-ID cleanup ledger **before** proposing real Docker execution. Explicitly distinguish plan-only POST/DELETE from a permitted daemon operation.
4. Owner must separately approve any GitHub Actions workflow merge/execution, Docker Engine connection, image/container creation and any Windows HML/production work.

**Gate status:** `R6J_WINDOWS=PASS_131/131_OFFLINE`, `R6K_FOCUSED_NATIVE=PASS_24/24_LOCAL`, `R6K_WINDOWS_FULL=PENDING_155/155`, `ACTIONS=NOT_RUN`, `REAL_DOCKER=BLOCKED`, `HML_PRODUCTION=NO_GO`.
