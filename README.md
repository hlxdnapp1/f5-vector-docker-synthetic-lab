# Vector Docker Synthetic Lab

Independent PUBLIC documentation-only repository for planning synthetic Docker API compatibility tests.

- No proprietary source, customer information, real logs, keys, certificates or private URLs.
- No copy/clone from private repositories.
- The protected `main` baseline has no GitHub Actions workflow; Draft review branches may contain manual-only, offline workflow proposals.
- The R6F Draft branch includes dormant, guarded Unix-socket GET transport code, which is NOT invoked by its workflow and has never contacted a real Docker daemon.
- Future synthetic fixtures and any manually triggered CI require separate security review and explicit approval.
- Test success here must never be interpreted as production or Windows Docker readiness.