# EXATA R24-03W R6L — Fake-producer pull relay, bounded offline only

Date: **2026-11-16**. Source: PUBLIC `hlxdnapp1/f5-vector-docker-synthetic-lab`. Principal governance: [private EXATA issue #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315).

## Authorization / trust boundary

Only preparation, testing and review **in a new Draft branch**. **Do not merge** public `main`; **do not execute** GitHub Actions; **do not access any real Docker Engine**, remote TCP or local Unix daemon, pull images, create/start/stop/delete containers, or alter EXATA Windows HML/SQL/fiscal/production.

Parent R6K approved in independent owner's Windows clone at commit **`3fb927e935d4e841180ef7ffb811e31012a90f62`**: GitHub/hash/diff/syntax PASS, **155/155 built-in Node tests PASS**, owner-provided report SHA-256 **`0D157693F22D9DE039DE0971F316C90B3942D7B98348633D26BCAA7F2FE10CF8`**. Report bytes were not uploaded; hash not independently recomputed. Parent public PR #10 is Draft and unmerged.

## New files: exactly three additions, no inherited source modifications

- `src/r6l-offline-pull-relay.mjs`: original Node ESM module that **only imports the approved R6K in-memory decoder**. `OfflineR6LChunks` is a privately branded, one-shot, in-memory fake source; it copies all supplied Buffer chunks, rejects general async iterables/subclasses, caps source chunks/bytes and destroys/zeroes owned raw buffers on closure. It cannot open network sockets, filesystem, subprocesses, Docker or any external source.
- `relayR6LOffline`: async generator that pulls exactly one fake chunk when the caller requests another safe frame; refuses subsequent source polling while the consumer is paused at a `yield`. Drains the bounded R6K output queue one frame per `next()`. Uses a maximum of **512** fake chunks, each **1–2,048 bytes**; total fake input at most **65,536 bytes**; R6K retains its **100-frame** maximum and max 8 output frames pending. The relay checks an AbortSignal and elapsed clock cooperatively (default 10 s, never above 30 s), closes its one-shot producer after normal completion, user break, cancellation, malformed frame, timeout or injected fake failure. Error categories are fixed and never reflect raw input or a fake upstream error string.
- `tests/r6l-offline-pull-relay.test.mjs`: **24 native Node tests**; only fabricated Docker multiplexed stdout/stderr frames with `R6F_PUBLIC_SYNTHETIC_ONLY` marker, and explicit bad secret-canary examples. Cases cover source brand refusal, input copies, every header split point, bytewise fragmentation, ordered channels, **no prefetch while the consumer pauses**, backpressure with 8 pending frames, consumer break/return, pre- and post-yield abort, fake upstream exception redaction, invalid marker/date/UTF8 inherited via R6K, same-chunk atomic refusal, later-chunk fail-closed behavior, truncated EOF, empty source, exactly 100 frames/101 denied, invalid sizes/count/options, cooperative deadlines and source-reuse denial.
- This documentation; no changes to previously approved R6B–R6K source/test files or the existing R6F manual offline workflow.

## Evidence

- On isolated local **Node.js v22.16.0**, `node --check` for R6K/R6L sources and new tests **PASS**, and focused R6L **24/24 native Node PASS**, **0 failed, 0 skipped**. `git hash-object` on the exact source/test files matches their GitHub blob hashes; verify once again in final PR review.
- Previous independent Windows parent suite **155/155 PASS**. **R6L combined suite 179/179 is still PENDING** fresh owner Windows clone of the published R6L HEAD. Do not claim 179 PASS before that evidence.
- No Actions runner or Docker daemon was started. No live Vector version was run. No secrets, customer data or private EXATA files were copied.

## Explicit limitations / blocked gates

1. **This is a fake-source-only generator, not a real stream processor.** It deliberately rejects arbitrary async iterables and cannot be connected to the Docker socket without a new, separately reviewed module/authorization. Tests prove no *in-memory fake* source polling while paused, not real network `pause()/resume()`, TCP backpressure, stream cancellation or daemon workload behavior.
2. **Cancellation and deadline are cooperative**. They are rechecked before/after fake reads and between yielded frames; there is no timer-based preemption of a stuck external call, because external calls are not allowed. A real endpoint must have independently enforced socket read/idle and total timeouts, proper upstream abort, resources/queue limits and audit.
3. Frames already emitted to a consumer before a subsequent malformed input **cannot be revoked**. Atomic refusal applies within a single `push` batch, not across a full continuous stream.
4. Only artificial marker logs are accepted; **not arbitrary customer or actual Docker application log content**. R6F still forces outbound `follow=false`, and R6K/R6L are not connected to the R6G HTTPS/mTLS gateway. No official Vector 0.53.0 end-to-end proof.
5. Real daemon identity/runner isolation, image provenance, digest pinning, actual Docker API quirks, durable ownership ledger and exact-ID teardown/rollback are still unproven. No production or HML go decision changes.

## Gates

| Dimension | Result |
| --- | --- |
| Parent R6K full Windows | **PASS 155/155 offline** |
| New R6L Node focused local | **PASS 24/24 offline** |
| Full combined R6L Windows | **PENDING 179/179** |
| Actions / Docker Engine / real Vector | **NOT EXECUTED / BLOCKED** |
| HML / production | **NO-GO** |

**Governance:** preserve approved commits; fail-closed evidence; separate explicit approval for every future runner execution, Docker operation, merge or production release.
