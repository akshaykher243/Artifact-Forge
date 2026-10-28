---
description: Security rules applied to every project
alwaysApply: true
---

# Security Rules

Rules a reviewer can cite at a specific line. Generic "be careful" advice belongs in onboarding, not here.

## Secrets

- Credentials, API keys, tokens, and signing keys come from environment variables or a secret store. Hardcoded values are blockers - including in tests (use a fixture loader).
- `.env` files are gitignored. Only `.env.example` is committed, with placeholder values that obviously aren't real (`replace-me`, not `sk_test_abc123`).
- Logs never contain passwords, tokens, full payment card numbers, government IDs, or session IDs. If a debug log prints a request body, redact these fields first.
- A secret that ever entered the repo - even in a deleted commit - is compromised. Rotate it, don't just remove it.

## Input at the boundary

- Validate every external input (HTTP body, query, header, file upload, message-queue payload) at the entry point with a schema validator. Inside the validated boundary, types can be trusted.
- Database access uses parameterized queries or an ORM. String-concatenated SQL is a blocker. Same for shell commands - use `spawn` with an argv array, never `exec` with interpolated input.
- HTML rendered from user input goes through the framework's escaping path. Bypasses (`dangerouslySetInnerHTML`, `v-html`, `mark_safe`) need a comment naming the sanitizer and what was sanitized.
- Path inputs that resolve to a filesystem location are normalized and confined to an explicit base directory. Reject paths containing `..` after normalization.

## Authentication and authorization

- Every protected route declares its auth requirement at the route definition, not inside the handler. "Forgot to add the check" is the failure mode this rule prevents.
- Authorization is checked on every request that returns or mutates a resource. Caching the answer across requests is the bug.
- Object-level access: when a handler reads a resource by ID from the request, verify the caller is allowed to see *that specific resource* before returning it. Returning someone else's record is the most common IDOR.
- Never echo back why authentication failed (user-not-found vs wrong-password). One generic message, same response time.

## API responses

- Error responses to clients carry a stable error code and a generic message. Stack traces, internal paths, and ORM errors stay in logs.
- `Content-Type` on incoming requests is checked against an allowlist. JSON endpoints reject `application/x-www-form-urlencoded` and vice versa to prevent CSRF on JSON APIs.
- Responses include the security headers the framework provides by default (HSTS, X-Content-Type-Options, frame-ancestors). Disabling one needs a written reason in the PR.

## Dependencies

- New dependencies require a one-line justification in the PR and a check that the package is maintained (last release within 12 months, more than one maintainer for anything that touches auth or crypto).
- High-severity advisories from the project's dependency audit tool are merge blockers unless explicitly waived with a written reason.
- Lockfiles are committed. Floating ranges in production dependencies are not.

## Data

- PII (names, emails, addresses, phone numbers, government IDs, health data) is logged only when the surrounding code names it explicitly and has a retention policy. Bulk request-body logging is the failure mode.
- Sensitive data at rest is encrypted by the storage layer (database TDE, KMS-managed S3 keys, etc.), not by hand-rolled crypto in application code.
- External calls are HTTPS only. HTTP is acceptable only inside a private network segment, and that constraint is documented at the call site.
