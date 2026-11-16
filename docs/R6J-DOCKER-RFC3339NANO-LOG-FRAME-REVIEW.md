# R6J — Docker RFC3339Nano log framing compatibility (DRAFT / OFFLINE ONLY)

Date: 2026-11-16. Public laboratory: `hlxdnapp1/f5-vector-docker-synthetic-lab`. Principal EXATA governance: [issue #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315).

**Authorization/scope:** offline-only code preparation and review in a new Draft branch. **NO merge, NO Github Actions execution, NO real Docker Engine connection, NO image download/container lifecycle, NO SQL/fiscal/HML/production changes.**

## Pinned baseline and owner evidence

R6I parent commit: `26c78574077e31b89fc2b47154915c1673f81105`. Owner independently executed clean Windows clone, verified branch/commit/blob SHA/diff/syntax PASS, combined Node **115/115 PASS**. Owner-local report: `R24_03W_R6I_RESULT.json`, reported SHA-256 `07AEF934F933AAA4FEB2530DD4D8974F2757F52A3460F1EE980ABBF71FEFC759`. Report bytes were not uploaded and their SHA-256 was not independently recomputed.

## Root compatibility error

Official Docker logs with `--timestamps` add RFC3339Nano timestamps. The Docker documentation shows exactly **9 padded fractional digits** (for example `2014-09-16T06:17:46.000000000Z`). The previously approved R6F in-memory response projector accepted **only 3 digits**, so its safe synthetic log projection could reject authentic Docker log frames even when channel/header, container identity and marker were correct.

Reference: [Docker logs, timestamps](https://docs.docker.com/reference/cli/docker/container/logs/).
Docker multiplexed log frame reference: [Docker Engine API](https://docs.docker.com/reference/api/engine/version/v1.44/).

## Minimal R6J diff

1. **Only the Docker log frame branch** of `src/r6f-real-docker-adapter.mjs` changes. Keep original 8-byte multiplex header checks, stdout/stderr channels 1/2, exact marker, strict fatal UTF-8, <=512 bytes per frame, <=16 KiB per whole response, <=100 frames, effective upstream `follow=false` and `tail<=100`, and all fail-closed response projection rules.
2. Accept UTC timestamps ending in uppercase `Z` with **0–9 decimal fractional digits** in the `R6F_PUBLIC_SYNTHETIC_ONLY` line. This supports Docker's padded nine-digit RFC3339Nano plus earlier three-digit synthetic fixtures; it does **not** silently accept arbitrary timezone offsets, malformed fractions, unvalidated calendar dates, additional text or secrets.
3. Beyond `Date.parse`, compare the parsed round-trip UTC calendar/time components to reject invalid but normalized dates (e.g. February 30) before releasing any bytes.
4. New `tests/r6j-docker-rfc3339nano-log.test.mjs` adds **16** native Node tests for 9-digit fraction, nonzero nanoseconds, 1–9 digit precision, no fraction, invalid >=10 precision, invalid date/time/zone, payload secrets, fatal UTF-8, frame header/truncation, atomic multi-frame denial, empty but valid snapshot, bounded `tail`, total body limit, unchanged GET/synthetic ID scope and no new IO primitives. The existing previous tests remain unchanged.

## Verification and key limits

- A preliminary V8 compatibility evaluation against the **actual GitHub source** using an emulated Node Buffer and URLSearchParams passed **15/15 runtime scenarios** (the 16th is a static source check); this is **NOT equivalent to native Node execution**, and must not be reported as a 16/16 Node PASS.
- Owner's previous native Windows R6I combined test suite: **115/115 PASS**, on the previous immutable commit.
- **R6J native full combined suite: PENDING 131/131** on exact published R6J commit. New R6J alone 16/16 native Node is also PENDING.
- This does **not** implement true Vector 0.53.0 continuous collection: outgoing Docker `follow=false` remains a finite snapshot. Future real daemon output may split one logical log record across several frames; that behavior is not handled by this change and must be tested separately before GO.
- Strict UTC-Z acceptance is appropriate for current synthetic fixtures and official Docker example but should be verified using an **actual isolated Linux daemon** before treating as broad RFC3339Nano time-zone compatibility.
- R6D's standalone synthetic-only model remains unchanged and is **not** used by the R6F/R6G candidate real-Docker path.
- There is no actual Docker Engine response, live framed stream, mTLS/Vector handshake, durable ownership journal, teardown or HML remediation evidence in this Draft.

## Gate status

| Gate | Status |
| --- | --- |
| R6I Windows offline | PASS 115/115 |
| R6J source review / GitHub diff | PENDING PINNED REVIEW |
| R6J V8 synthetic precheck | 15/15 (compatibility harness only) |
| R6J native Node Windows full combined | PENDING 131/131 |
| GitHub Actions / Docker Engine / image pulls | NOT RUN, BLOCKED |
| EXATA Windows / HML / production | UNTOUCHED, NO-GO |

**Rule:** no Docker or production operation until separate approval for a truly isolated hosted runner, reviewed code, fail-closed teardown, reliable continuous logs and confirmed rollback.
