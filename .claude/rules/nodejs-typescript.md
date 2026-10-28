---
description: Node.js and TypeScript rules (request handling, validation, error handling, logging)
globs: ["**/*.ts","!**/*.tsx"]
alwaysApply: false
---

# Node.js + TypeScript Rules

## Request Handling
- Validate all request input at the system boundary before any business logic runs
- Use a schema validation library (Zod, Joi, or class-validator) - never manual checks
- All async route handlers must be wrapped in try/catch or use an async error wrapper

## Response Shape
- All API responses use a consistent envelope. Default convention:
  Success: { success: true, data: T }
  Error:   { success: false, error: { code: string, message: string } }
- Never return different shapes for the same endpoint
- HTTP status codes must match response semantics - 200 for success, 4xx for client errors, 5xx for server errors

## Database
- Always use parameterised queries or ORM methods - never string concatenation
- Handle connection errors explicitly - never let DB errors bubble as unhandled
- Use transactions for operations that modify multiple tables

## Error Handling
- Don't swallow errors. Empty `catch {}` blocks hide failures silently.
- Throw at HTTP and external API boundaries; return typed values for expected domain absence (missing record, failed lookup).
- Create typed domain error classes that extend Error.
- Centralise error handling in a single error handler middleware.
- Log errors with context: request ID, user ID if available, stack trace.
- Never expose error internals to the API response - no raw error objects, stack traces, or library names.

## Environment

- Never access `process.env` directly outside the typed config module. Read once, validate, expose as typed values.

## Testing

- Integration test every endpoint - use a test database or in-memory store.
- Test error paths explicitly - not just happy paths.
- See `principles.md` for universal testing rules.
