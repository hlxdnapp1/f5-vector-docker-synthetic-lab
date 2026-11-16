# R6D — Offline synthetic response-boundary review (no Docker daemon)

**Governance:** The previously approved R6C commit `d202343fa764218929c898351fc558602413f72e` is preserved. Owner Windows combined Node 21/21 PASS on R6C. This R6D review is a separate unmerged candidate.

## Public-only scope

Files added:
- `tests/synthetic-response-boundary.mjs`: original offline function that first calls the R6C request classifier and then returns an explicitly projected version of a *fake* response.
- `tests/synthetic-response-boundary.test.mjs`: 16 Node built-in positive and negative tests (no packages, Docker, spawned processes or network requests).
- This review document.

No privately developed API implementation, source code, customer data, certificate, real container ID, endpoint, secret, Docker image or runtime configuration was copied into this repo. Both sample IDs are artificial (`a` repeated 64 chars = allowed, `b` repeated 64 chars = excluded), and the only accepted log marker is `SYNTHETIC_VECTOR_R6B_ONLY`.

## What is checked, and what is not

1. Request classification is **fail-closed**: only GET routes to selected synthetic ID, `tail <= 100`, no duplicate/unknown query parameters. This is inherited from R6C and called before considering the response body.
2. A synthetic container-list JSON response is parsed under a strict 8 KiB / 8-item cap. Only a synthetic authorized ID is projected with a safe list of fixed fields; the outsider ID is ignored. Any unknown ID fails closed.
3. A synthetic inspect JSON response is projected to fixed harmless fields. All environment variables, labels, IPs, mounts, image digests, host paths and other unrecognized fields are discarded.
4. Synthetic newline-delimited event records are capped to 8 KiB / 16 records, include only recognized synthetic IDs, and project a minimal `Type/Action/Actor.ID` object. Outsider events are omitted; unknown identities/actions are denied.
5. Synthetic multiplexed Docker log frames must use a valid 8-byte header, accepted stdout/stderr channels, reserved zero bytes, length within 512 bytes, valid strict UTF-8, an RFC3339 UTC timestamp followed by the fixed artificial marker and newline. Total log payload is capped at 16 KiB and 100 frames. Frame count exceeding request tail is denied; output frames are freshly allocated.
6. All denied responses return only a finite categorical code and `output=null`; they must not echo raw caller payloads.

**Critical limitation:** This is **only an in-memory test model**, not an HTTP proxy, Docker Engine adapter, mTLS endpoint, streaming/backpressure implementation, complete Docker API model or security boundary approved for deployment. The output has no network destination and no ability to connect to a daemon. It is deliberately not integrated into any EXATA or Supabase code.

A real Docker proxy would additionally need: pinned actual daemon identity, strict segmentation away from HML and production, Docker API version negotiation, authentication and authorization by resource on BOTH request and stream responses, filtering before writing bytes to clients, bounded memory and backpressure over unbounded event/log streams, cancellation/reconnect handling, client certificate revocation, audit trails, robust fail-closed rollback, and separate owner approval. **Do not expose a Docker socket or client TLS credentials to this code or a nontrusted process.**

## Gates

- R6B public 8/8 and R6C public combined 21/21: **PASS on owner's Windows**.
- R6D new 16 tests: require Windows Node `node --test` and exact commit/blob/diff validation; no `npm install`.
- Full combined suite should count **37 tests** (8+13+16), all PASS, no skips or failures. Until executed in a fresh Windows clone, mark **PENDING**.
- No `.github/workflows` is permitted. No Actions minutes/charges, no Docker daemon access, no VM, no SQL, no fiscal modifications.
- Even after 37/37 PASS, R6 real-Docker integration remains **BLOCKED** until a separately reviewed, authorized test against a truly isolated daemon on a GitHub-hosted runner.
- HML recovery / production: **NO-GO**.
