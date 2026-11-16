# Security review gate — synthetic-only contract

This repository contains original, public, artificial identifiers and Node.js tests. It is independent of any commercial ERP, customer infrastructure, production Docker instance, repository code, private URL, key or certificate.

## Scope for this review branch

- README, SECURITY and ignore rules from the original repository bootstrap.
- `fixtures/contract.json`: clearly fake container identities, an artificial marker, allowed read-only operation names, a 100-line tail limit.
- `package.json` and `tests/contract.test.mjs`: Node built-in test runner, no dependencies, network clients, shell invocation, Docker API or external calls.
- No `.github/workflows/` folder and no GitHub Actions run.

## Security acceptance requirements

1. Verify this review branch originates from the public baseline, has no private commit, diff, vendored source, secrets or real environment identifiers.
2. Verify all manifest/test data are fictional; placeholders must never be treated as real Docker IDs.
3. Verify Node tests are deterministic and cannot open sockets, invoke Docker, contact HML or spawn processes.
4. Verify that passing the test suite proves only manifest boundaries, **not** real daemon access or functioning Vector collection.
5. Review any future real-Docker adapter separately, explicitly requiring daemon identity, resource isolation, API allowlist, denial of writes, bounded logs, mTLS where appropriate and synthetic logs only.
6. Review and approve any future CI YAML **before creation or execution**. No self-hosted runners, secrets, private code, production URLs, paid runner classes or automatic trigger.
7. Keep production, original Windows Docker daemon and protected services outside the test boundary.

## Gate results at authoring

Public repository bootstrapped successfully and verified at its initial SHA. Current branch is a review candidate only; no GitHub Actions configuration is provided. R6 real Docker integration remains blocked and outside scope.

