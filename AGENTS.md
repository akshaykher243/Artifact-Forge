# AGENTS.md

<!-- ai-forge:structure:start -->

## Structure

ArtifactForge is a single pnpm package: a local-first PR review app. A React UI built with Vite talks to a Fastify service bound to 127.0.0.1. The service runs `git` and `gh` from a fixed allowlist and stores drafts in the per-user app data folder. Request and response contracts live in `src/shared` and are imported by both sides. Behaviour is specified in `openspec/`; `openspec/changes/local-pr-review-app/design.md` and `openspec/changes/dependency-map/design.md` explain how it is built.

```
src/
  client/          React UI (Vite)
    app/           shell, token bootstrap, typed operation client
    workspace/     sidebar, header, resizer, progress
    files/         file tree, compact list
    diff/          render.ts (ported from the artifact), sections, rows
    drafts/        comment gutter and editor, review drawer
    map/           layout.ts (ported from the artifact's map), canvas, toolbar, drawer
    submit/        confirm dialog, result
    repo/          repository, ref and PR pickers
    ui/            shared primitives
    styles/        tokens.css, fonts
  server/          Fastify local service
    index.ts       start-up and flags
    doctor/        `pnpm run doctor`: prerequisite checks (main.ts is its entry)
    routes/        operation router and one handler file per operation group
    git/           git argument builders and output parsers
    gh/            gh argument builders and output parsers
    security/      request hooks, validators, process runner, secret masking
    store/         app-data JSON store
    map/           Git source snapshot, TypeScript analyzer (worker thread), map service
    fixtures/      fixture comparison source (--fixture)
  shared/          zod operation contracts and inferred types
tests/
  unit/            Vitest, pure functions (mirrors src/ paths)
  int/             Vitest, real temporary Git repos and the fake gh
  e2e/             Playwright specs (*.spec.ts), test.ts (shared fixtures), pages/ (page objects)
  fixtures/        small.json, large.json, repo builders, snapshot helper, app launcher
  bin/gh           fake gh used by int and e2e tests
docs/              reference material (the exported artifact); never edited
openspec/          specs and changes
```

### Conventions

- **Naming:**
  - Files are kebab-case (`file-tree.tsx`, `run-process.ts`).
  - React components are PascalCase exports.
  - Each operation name is camelCase and matches its key in `src/shared/operations.ts`.
- **Functions:** arrow functions only, braces on every `if` (enforced by ESLint `func-style` and `curly`). Named exports, no default exports except where a tool requires one (Vite and Playwright config).
- **Imports:**
  - The client never imports from `src/server`, and the server never imports from `src/client`. Both may import `src/shared`.
  - Relative imports everywhere, with the `.ts` extension, including into `src/shared`. No path aliases: the server runs from source with `tsx` (there is no server build), so imports must resolve as written.
- **Process execution:**
  - Only `src/server/security/run-process.ts` may spawn processes.
  - Argument arrays are built only in `src/server/git` and `src/server/gh`, from validated values.
  - Never use a shell, `exec` or string commands.
- **Validation:** every operation input is parsed with its zod schema before use. Paths, refs and PR numbers go through `src/server/security/validate.ts`.
- **Styling:** CSS Modules that use only the custom properties in `src/client/styles/tokens.css`. No inline colour literals, no runtime third-party assets.
- **Tests:**
  - `tests/unit` and `tests/int` mirror `src/` paths.
  - Test titles name the spec scenario they cover.
  - No live GitHub calls in automated tests.
- **Docs:** files under `docs/` are read-only references.

<!-- ai-forge:structure:end -->

<!-- ai-forge:rules:start -->

## Engineering rules

Synced from ai-forge. Re-run `npx ai-forge` to update.

Always apply:
@.claude/rules/principles.md
@.claude/rules/security.md
@.claude/rules/performance.md

Load on demand. Read the file when the work matches the globs:

- `.claude/rules/typescript.md` - TypeScript language rules (strict mode, no any, async, imports). Matches: `**/*.ts`, `**/*.tsx`.
- `.claude/rules/react-typescript.md` - React and TypeScript component rules (functional components, hooks, props, testing). Matches: `**/*.tsx`, `**/*.ts`.
- `.claude/rules/nodejs-typescript.md` - Node.js and TypeScript rules (request handling, validation, error handling, logging). Matches: `**/*.ts`, `!**/*.tsx`.

<!-- ai-forge:rules:end -->
