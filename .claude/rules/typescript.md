---
description: TypeScript language rules (strict mode, no any, async, imports)
globs: ["**/*.ts","**/*.tsx"]
alwaysApply: false
---

# TypeScript Rules

Language-level rules for TypeScript projects. Apply alongside `principles.md` and any stack-specific file (`nodejs-typescript.md`, `react-typescript.md`).

## Language

- Enable strict mode in `tsconfig.json`. No exceptions.
- Never use `any`. Use `unknown` and narrow with type guards.
- Functions exported from a package's public entry point declare an explicit return type. Internal functions can rely on inference unless the inferred type is non-obvious or load-bearing.
- Use `type` for unions and primitives, `interface` for object shapes.
- Use `const` for all declarations, `let` only when reassignment is necessary, never `var`.

## Code quality

- Function length: 40 lines is the soft cap. Extract a named helper when exceeded.
- File length: 300 lines is the soft cap. Split into modules when exceeded.
- No `console.log` in production code. Use the project's logger.

## Async

- Always use `async` / `await`. Never `.then()` chains.
- Every async function handles its errors - wrap in `try` / `catch` or propagate explicitly.
- No floating promises. Always `await` or explicitly `void` them.

## Imports

- No circular imports. Dependency direction is strictly top-down.
- Group imports: external packages first, internal modules second, with a blank line between groups.

## Error handling

- Don't swallow errors. Empty `catch {}` blocks hide failures silently.
- Don't use exceptions for control flow. Throw at system boundaries (HTTP handlers, external API calls, env validation); return a typed value or `null` for expected domain absence.
- Validate at system boundaries (API payloads, env vars, external responses). Trust the types inside.
- Never leak internals - don't send raw error objects, stack traces, file paths, or library names to callers or clients.
- Errors must be informative. `new Error("failed")` tells no one anything; include context.
- Use typed custom error classes that extend `Error` for domain errors.
