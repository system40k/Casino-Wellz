# Casino-Wellz Production Hardening Roadmap

Casino-Wellz currently has a strong product/demo frontend, but the browser is still trusted with responsibilities that must be server-authoritative before any real-money launch.

## Production invariant

The browser is untrusted. It may request actions and render results, but it must never be authoritative for:

- authentication decisions
- wallet balances
- deposits or withdrawals
- wager acceptance
- game outcomes
- server seeds
- transaction settlement
- KYC or restriction state

## Phase 1 — Guardrails and CI

- Add explicit runtime mode (`demo` vs `production`).
- Fail closed when production mode is missing a secure backend API URL.
- Route production wagering through a backend-facing service boundary.
- Keep local game logic available only for demo mode.
- Add automated typecheck, lint/check, test, and build gates.
- Document required production environment variables.

## Phase 2 — Authentication

- Implement challenge/nonce endpoint.
- Verify wallet signatures server-side.
- Bind challenge to address, chain, origin, expiry, and one-time nonce.
- Issue short-lived authenticated sessions.
- Add replay protection, rate limiting, and session revocation.

## Phase 3 — Authoritative ledger

- PostgreSQL-backed immutable ledger.
- Wallet/account rows with row-level locking.
- Atomic bet transaction: validate -> lock -> debit -> settle -> credit -> commit.
- Idempotency keys for bets, deposits, and withdrawals.
- Reconciliation jobs and invariant checks.

## Phase 4 — Server-side game engine

- Move RNG and outcome calculation out of the browser.
- Store unrevealed server seeds in protected server-side storage.
- Commit to seed hashes before use and reveal only after rotation.
- Persist nonce usage and enforce uniqueness.
- Add deterministic fairness verification tests.

## Phase 5 — Payments

- Dedicated deposit addresses or a robust attribution strategy.
- Server-side chain listeners with canonical block-height confirmation logic.
- Withdrawal request, approval/risk checks, signing, broadcast, and reconciliation.
- Hot/cold wallet separation and operational controls.

## Phase 6 — Compliance and player protection

- KYC/AML provider integration.
- Age verification and jurisdiction controls.
- Server-enforced deposit, wager, loss, and session limits.
- Self-exclusion and cool-off controls.
- Audit events for sensitive user/admin/money actions.

## Phase 7 — Operations

- Structured logging and trace IDs.
- Error and performance monitoring.
- Metrics, alerts, uptime checks, and incident runbooks.
- Database backups plus restore drills.
- Load, race-condition, and fault-injection testing.

## Definition of production ready

Real-money mode must remain disabled until all P0 controls are implemented and independently tested. A successful frontend deployment alone does not constitute production readiness.
