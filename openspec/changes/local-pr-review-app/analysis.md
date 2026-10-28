# Analysis: local PR review app from the prflow artifact

Status: approved 2026-10-26. Sections 6, 7 and 10 were drafts; `design.md` and `tasks.md` are now the authoritative versions.

## 1. What exists in the project

| Item                                | Finding                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Folder                              | `ArtifactForge/` holds `docs/prflow report redesign – Review execution order and diffs.html` (205,880 bytes, 390 lines) and `.DS_Store`. Nothing else. |
| Git                                 | **Not a Git repository** (`git log` fails), although the session reported one. Needs `git init` before the first commit.                               |
| Package manager, framework, scripts | None: no `package.json`, lockfile, `tsconfig`, README, tests or dev instructions.                                                                      |
| OpenSpec                            | None existed. Initialized 2026-10-26 with `openspec init --tools none` (default `spec-driven` schema). Nothing in `docs/` was touched.                 |
| Toolchain on this machine           | git 2.50.1, Node 22.13.1, pnpm 10.12.1, gh 2.97.0, openspec 1.13.1.                                                                                    |
| `gh` auth (token never displayed)   | Signed in to github.com as `akshaykher243` via the keyring; Git protocol `ssh`.                                                                        |
| prflow analyzer                     | Not found anywhere under `th-workspace` (searched by name).                                                                                            |

### Missing inputs

- `docs/` has **no architecture, product or requirements documents**. The only reference is the artifact itself.
- No prflow report schema or analyzer source, so the meaning of entry-point kinds and `earlier` is inferred from the sample data.
- Etchpad was not opened. As agreed, it is a product reference only, and nothing in the specs depends on it.

## 2. What the exported artifact is

The file is a **Claude Design export bundle**, not a React app:

- A loader script decodes a `__bundler/manifest` of three base64, gzip-compressed assets into blob URLs, then swaps in a `__bundler/template`.
- Assets:
  - `dc-runtime` (45 KB, generated, marked "do not edit")
  - React 18.3.1 UMD and ReactDOM 18.3.1 UMD (vendored from jsDelivr)
- The template is an `<x-dc>` HTML template with `{{binding}}` interpolation:
  - `<sc-if>` / `<sc-for>` control tags
  - `sc-camel-on-*` event attributes
  - `hint-placeholder-*` design-tool hints
  - `<helmet>` that loads **IBM Plex Mono from Google Fonts**
- All logic is one inline `text/x-dc` script (~67 KB, 646 lines):
  - a `class Component extends DCLogic` with a `state` object
  - `renderVals()` returning every bound value and handler
  - `mapVals()` for the Map tab
  - `resizer()` for the drag handles
  - pure helpers `tokenize`, `segments`, `wordRange`, `toSplit`, `anchorOf`
- Data is hardcoded: `SMALL` is a JSON literal for `prflow-platform`, `main` → `feature/multi-currency`, 11 files. `buildLarge()` generates a fake monorepo ("generated example, not a real repo").

**Reusable source:** the pure helpers and the state model port cleanly to TypeScript; the dc-runtime and bundler do not. The markup is readable but uses inline styles with hardcoded colours, so styles have to be re-expressed. The two datasets become test fixtures.

To extract it again (read-only): `python3 -I <scratchpad>/tools/unpack.py <artifact.html> <outdir>`. The script sits in the session scratchpad and is not part of the project.

### Things that depend on the Claude Artifacts runtime

`DCLogic` base class and `setState` re-render model; template bindings and `sc-*` tags; blob-URL asset loading and CSP workarounds (`window.__resourceBlobs`); the `hz:` canvas meta tags (1440×1180) and `data-props.$preview`; React from global UMD; Google Fonts at runtime.

## 3. Feature and interaction inventory

The evidence is the method or field in the inline script, plus the template copy. Confidence: **High** means read directly in the code and template. Behaviour was verified by reading the code, **not** by running it in a browser; visual baselines are captured in milestone 2.

| #   | Feature                                                                              | Interaction → result                                                                                                      | States                            | Evidence                     | Status               | v1                                                 |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------- | -------------------- | -------------------------------------------------- |
| 1   | `Small diff` / `Large diff` switch                                                   | Swaps dataset; resets lens, file, folds, zoom, compact                                                                    | pressed                           | `setSize`                    | Working (demo)       | Dropped: fixtures only                             |
| 2   | Size note                                                                            | `<repo> · <n> files, +a −d`                                                                                               | n/a                               | `sizeNote`                   | Working              | Adapted to the real comparison                     |
| 3   | `Remaining` +/− and progress ring                                                    | Sums lines of **functions** not reviewed; ring = reviewed share                                                           | 0–100%                            | `renderVals` (remA, pct)     | Working              | Adapted: counts **files** (function data deferred) |
| 4   | `Compact`                                                                            | Flat file list, tighter rows, hides kind badges                                                                           | pressed                           | `toggleCompact`, `compact`   | Working              | Kept                                               |
| 5   | `Order of execution` list                                                            | Entry points with number, label, kind badge, +/−, reviewed checkbox, caret                                                | active, open, all done (`Viewed`) | `lenses`                     | Working on fixtures  | Deferred                                           |
| 6   | Pick entry point                                                                     | Filters the diff and file list to that path; ✕ clears                                                                     | active ring                       | `pick`, `clearLens`          | Working              | Deferred                                           |
| 7   | Expand entry point                                                                   | Shows its call rows with depth indent and state (`✓`, `·`, `s<n>`)                                                        | open                              | `toggle`, `items`            | Working              | Deferred                                           |
| 8   | `Not reached by any entry point`                                                     | Collapsible group list                                                                                                    | open                              | `toggleOff`, `off`           | Working              | Deferred                                           |
| 9   | Files tree                                                                           | Compressed folder chains, collapse, marks, +/− or `Reviewed`, tooltip, selection                                          | open, selected, reviewed          | `walk`, `dirClosed`          | Working              | Kept                                               |
| 10  | `Files, <n>` (filtered `n of m`, `touched by <path>`)                                | Header count                                                                                                              | filtered                          | `fileCount`                  | Working              | Kept, without the path filter                      |
| 11  | Header crumb/heading/subheading                                                      | Changes with mode                                                                                                         | all, step, file, map              | `crumb`, `heading`           | Working              | Kept, copy adapted                                 |
| 12  | `Diff` / `Map` tabs                                                                  | Switch views                                                                                                              | pressed                           | `showDiff`, `showMap`        | Working              | Map deferred, so the tabs are hidden               |
| 13  | Path sections                                                                        | One section per function in run order; earlier ones start folded with `Folded, first seen in step n`                      | open, folded, reviewed            | `sections`                   | Working              | Deferred                                           |
| 14  | File section                                                                         | Selected file only; `Back to all paths`                                                                                   | open                              | `st.file` branch             | Working              | Kept as `Back to all files`                        |
| 15  | Section header                                                                       | Caret, language badge, name + path, status, +/−, button, checkbox                                                         | n/a                               | template `<section>`         | Working              | Kept                                               |
| 16  | `Whole file` / `Just this function`                                                  | Function section shows the whole file diff                                                                                | toggled                           | `whole`                      | Working              | Deferred with function sections                    |
| 17  | Side-by-side diff                                                                    | Paired −/+ runs, hatch, word highlight (<70% rule), fold rows `⋯ n unchanged lines`, min-width 900 with horizontal scroll | n/a                               | `toSplit`, `wordRange`       | Working              | Kept                                               |
| 18  | Syntax colouring                                                                     | Regex tokenizer: keywords, strings, numbers, comments, literals, capitalised identifiers                                  | n/a                               | `tokenize`                   | Working (TS-centric) | Kept                                               |
| 19  | Reviewed checkboxes                                                                  | Function-level (`reviewed`) and file-level (`fileReviewed`) are **separate**; the ring only counts function-level         | checked                           | `check`                      | Working              | Unified to file-level                              |
| 20  | Sidebar resize                                                                       | Drag with pointer capture, arrows ±24 (Shift ±80), double-click resets, clamp 240–760                                     | dragging highlight                | `resizer`                    | Working              | Kept                                               |
| 21  | Map: levels, zoom (50–160%), `Diff overlay`, ‹ › path stepping, nodes, edges, legend | Layout by call depth                                                                                                      | selected, dimmed                  | `mapVals`                    | Working on fixtures  | Deferred                                           |
| 22  | Map detail drawer                                                                    | Code or files of the selection, reviewed checkbox, `Open in Diff view`                                                    | open                              | `mapVals` (d)                | Working              | Deferred                                           |
| 23  | Git panel                                                                            | Head and base SHAs; `see this branch's changes` and `show diff to here` only toggle overlay and lens                      | open                              | `toggleGit`, `gitSeeChanges` | Mostly placeholder   | Deferred                                           |
| 24  | Git panel and drawer resizers                                                        | Same as #20                                                                                                               | n/a                               | `gitR`, `drR`                | Working              | Deferred                                           |

**What the artifact does not have:** comments of any kind, repository or ref selection, PR identity, loading/error/empty states, persistence (all state is in memory), keyboard shortcuts beyond the resizer arrows, responsive rules (fixed 1440 px design canvas). Its accessibility basics are present: `aria-pressed`, `aria-expanded`, labelled icon buttons, and native buttons and checkboxes.

## 4. PR review features: classification

Legend: **V** verified in the artifact, **R** explicitly requested by you, **P** proposed, **U** unsupported by the chosen integration, **C** needs clarification.

| Capability                                  | Class                                      | v1                                                                                                                 |
| ------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Select a local repository                   | R                                          | Yes, limited to root folders (C: which roots)                                                                      |
| Inspect branches and commits                | R                                          | Branches, tags and remote branches as ref choices; commit history browsing deferred                                |
| Base/head selection                         | R                                          | Yes                                                                                                                |
| Fetch PR refs over SSH on request           | R                                          | Yes, no refs written                                                                                               |
| Compare refs, changed files, stats, context | R+V                                        | Yes                                                                                                                |
| Group and filter files                      | V (tree, compact) / R (filter)             | Tree and compact yes; text filter of the file list **P**, in milestone 5                                           |
| Navigate files and sections                 | V                                          | Yes                                                                                                                |
| Search changed files                        | R                                          | Same as the filter above                                                                                           |
| Missing refs, fetch failures, empty diffs   | R                                          | Yes                                                                                                                |
| Inline comment, line or range               | R                                          | Yes                                                                                                                |
| Overall comment                             | R                                          | Yes                                                                                                                |
| Edit/delete unsent                          | R                                          | Yes                                                                                                                |
| Local drafts                                | R                                          | Yes (C: reviewed-mark persistence)                                                                                 |
| Pending list and navigation                 | R                                          | Yes                                                                                                                |
| Submit inline and overall                   | R                                          | Yes, one `gh api` call                                                                                             |
| Success/failure display                     | R                                          | Yes                                                                                                                |
| Outdated line positions                     | R                                          | Exact-text re-anchor, otherwise `Outdated`                                                                         |
| Existing PR review comments                 | R (if supported)                           | **Deferred**: inline threads need a second `gh api` endpoint; `gh pr view --json reviews` only gives review bodies |
| Confirm target before submit                | R                                          | Yes                                                                                                                |
| Approve / request changes                   | P                                          | Out (Comment only)                                                                                                 |
| Discover open PRs without a number          | U by local Git; possible with `gh pr list` | Out (not requested; can be added)                                                                                  |

**Minimum viable workflow:**

1. Open a repository.
2. Enter a PR number.
3. Fetch over SSH.
4. Review the diff and mark files reviewed.
5. Write drafts.
6. Confirm.
7. Post one Comment review.
8. See its link.

## 5. Recommended stack

| Concern         | Choice                                                                                                                  | Why                                                                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI              | **Vite + React + TypeScript** single-page app                                                                           | The artifact is client-rendered React; there is no SEO or SSR need. Next.js would add server rendering and put subprocess code inside the web framework for no benefit on a one-machine tool. |
| Local service   | **Node 22 + Fastify**, same package, `127.0.0.1` only                                                                   | Git and `gh` must run as subprocesses, which a browser cannot do. Fastify gives request schemas and serves the built UI in production.                                                        |
| Validation      | zod (shared request/response types)                                                                                     | One definition checked on both sides.                                                                                                                                                         |
| Diff model      | Own unified-diff parser into the artifact's `[sign, oldNo, newNo, text]` rows and fold rows                             | Reuses the artifact's renderer exactly; a diff-view library would change the look.                                                                                                            |
| Rendering       | Port `tokenize`, `segments`, `wordRange`, `toSplit` nearly verbatim                                                     | Visual fidelity; each is a pure function and unit-testable.                                                                                                                                   |
| Styling         | CSS Modules + CSS custom properties holding the artifact's palette; self-hosted IBM Plex Mono                           | Keeps exact values; no runtime Google Fonts (local-first, works offline).                                                                                                                     |
| State           | React `useReducer` + context; a small typed fetch client                                                                | The state is small; no global store library needed.                                                                                                                                           |
| Large diffs     | Windowed rendering added in milestone 5 only if the performance check shows it is needed                                | Keep it simple until measured.                                                                                                                                                                |
| Persistence     | JSON files in the per-user app data folder, atomic write                                                                | No database; nothing in the repository.                                                                                                                                                       |
| Tests           | Vitest (unit and integration against real temporary Git repositories and a fake `gh`), Playwright (e2e and screenshots) | Matches your existing testing stack.                                                                                                                                                          |
| Quality         | ESLint (`curly`, arrow-function `func-style`), Prettier, `tsc --noEmit`, Lefthook pre-commit                            | Matches your code-style preferences.                                                                                                                                                          |
| Package manager | pnpm                                                                                                                    | Your standard.                                                                                                                                                                                |

## 6. Architecture and structure (draft for design.md)

```
Browser (UI, 127.0.0.1:<port>)  ──HTTP + session token──▶  Local service (Node)
   React views, drafts UI                                    ├─ operation router (allowlist)
                                                             ├─ validators (paths, refs, PR numbers)
                                                             ├─ git runner (execFile, no shell)
                                                             ├─ gh runner (execFile, no shell)
                                                             └─ store (drafts, reviewed marks, recents)
                                                                   │
                                     local clone (.git) ◀──git──┘   GitHub ◀──gh (HTTPS API)──┘
                                     remote ◀──git over SSH (fetch only)
```

```
ArtifactForge/
  docs/                      untouched reference
  openspec/
  src/
    client/                  app shell, workspace/, files/, diff/, drafts/, submit/, styles/tokens.css
    server/                  index.ts, routes/, git/, gh/, security/, store/
    shared/                  operation schemas and types
  tests/
    fixtures/                small.json, large.json (from the artifact), repo builders
    unit/  int/  e2e/        e2e includes visual baselines of the original artifact
  package.json  vite.config.ts  tsconfig.json  eslint.config.js  lefthook.yml
```

Start-up: `pnpm start --root ~/Desktop/Personal-Space` prints `http://127.0.0.1:<port>/#token=<random>`. The UI moves the token into session memory and clears it from the URL.

## 7. Git and SSH integration

Every call: `execFile('git', ['-C', repo, '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...])` with environment `GIT_TERMINAL_PROMPT=0`, `GIT_PAGER=cat`, `GIT_OPTIONAL_LOCKS=0`, `LC_ALL=C`, `SSH_ASKPASS_REQUIRE=never`, a timeout and an output cap.

| Operation                    | Command                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Check repository             | `rev-parse --show-toplevel` (must equal the resolved path)                                                                                                                                  |
| Remotes                      | `remote -v` (GitHub SSH URL parsed into owner/repo)                                                                                                                                         |
| Refs                         | `for-each-ref --format=… refs/heads refs/remotes refs/tags`                                                                                                                                 |
| Resolve ref                  | `rev-parse --verify --end-of-options <ref>^{commit}`                                                                                                                                        |
| PR head SHA (no `gh` needed) | `ls-remote <remote> refs/pull/<n>/head`                                                                                                                                                     |
| Default branch               | `ls-remote --symref <remote> HEAD`                                                                                                                                                          |
| Fetch, writing no refs       | `fetch --no-tags --no-write-fetch-head --no-recurse-submodules --refmap= <remote> refs/pull/<n>/head refs/heads/<base>`, then check the fetched commits equal the SHAs `ls-remote` reported |
| Verify                       | `cat-file -e <sha>^{commit}`                                                                                                                                                                |
| Merge base                   | `merge-base <base> <head>`                                                                                                                                                                  |
| Files                        | `diff --no-ext-diff --no-textconv --no-color -M -z --name-status <mb> <head>` and `--numstat`                                                                                               |
| File diff                    | `diff --no-ext-diff --no-textconv --no-color -M -U3 <mb> <head> -- <path> [<oldPath>]`                                                                                                      |

Fetched objects are not referenced by any ref, so `git gc` may prune them after its grace period; the app fetches again when needed. Nothing is ever pushed, checked out, reset or configured.

## 8. GitHub CLI capabilities and authentication

| Need                                        | `gh` support (gh 2.97.0)                                                                                                                                                                  | Used                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Signed-in account (no token)                | `gh auth status --json hosts --hostname <host>`                                                                                                                                           | Yes                                           |
| PR metadata                                 | `gh pr view <n> -R <owner/repo> --json number,title,state,isDraft,url,baseRefName,headRefName,baseRefOid,headRefOid,isCrossRepository,author`                                             | Yes                                           |
| Overall review comment                      | `gh pr review --comment -F -`                                                                                                                                                             | Not used: superseded by the single call below |
| **Inline comments**                         | **Not supported by `gh pr review`** (flags: approve, comment, request-changes, body only)                                                                                                 | Via `gh api`                                  |
| Atomic review with inline comments          | `gh api --method POST repos/<owner>/<repo>/pulls/<n>/reviews --input -` with `{commit_id, event:"COMMENT", body, comments:[{path, body, line, side, start_line?, start_side?}]}` on stdin | **Yes: the only `gh api` call allowed**       |
| Check for a review after an unknown outcome | `gh pr view <n> -R … --json reviews`                                                                                                                                                      | Yes                                           |
| Existing inline threads                     | Needs `gh api …/pulls/<n>/comments`                                                                                                                                                       | No (deferred)                                 |

`gh` runs with `GH_PROMPT_DISABLED=1`, `GH_NO_UPDATE_NOTIFIER=1`, `GH_PAGER=cat` and `NO_COLOR=1`, from the app's data folder, so that `gh` cannot infer the repository from the working directory.

**Being upfront about the API:** `gh pr view` uses GitHub's GraphQL API and `gh api` is a raw REST call. The app has no API client of its own and stores no credentials, but it does talk to GitHub's APIs through `gh`.

**Authentication:** SSH keys authenticate `git fetch` only; `gh` uses its own OAuth token in the macOS keyring (present for `akshaykher243`). A PR in an org that enforces SAML SSO needs that token authorised for the org (`gh auth refresh` or the web flow; you do this, not the app). `gh` needs `repo` scope for private repositories.

**GitHub rules the app enforces before sending:**

- Inline comments must sit on lines inside the PR diff's hunks (`side` is `RIGHT` for added and context lines, `LEFT` for removed lines).
- A range must stay within one hunk.
- One user can hold only one pending review per PR. If one exists, GitHub refuses the request (422) and the app shows that message.

## 9. Review workflow and threat model

**Workflow states:** Draft → (confirm) → Submitting → Submitted | Failed (drafts kept) | Outcome unknown (resubmission blocked until a check runs).

| Threat                                                                    | Mitigation                                                                                                                 | Limit                                                             |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| A malicious web page calls the localhost service (CSRF)                   | Session token, Origin check, no `GET` that changes anything, no permissive CORS                                            | The token sits briefly in the start-up URL, which is then cleared |
| DNS rebinding                                                             | `Host` header must be the loopback name and port                                                                           | n/a                                                               |
| Command or flag injection through refs, paths or PR numbers               | Allowlisted operations, fixed argument templates, validation, `--end-of-options` and `--`, no shell                        | n/a                                                               |
| Malicious PR content runs code (diff drivers, textconv, hooks, fsmonitor) | `--no-ext-diff --no-textconv`, `core.hooksPath=/dev/null`, `core.fsmonitor=false`, no checkout                             | The user's own global Git config is trusted                       |
| XSS from code in the diff or comment text                                 | React text rendering only (no raw HTML), strict Content Security Policy (`self` only)                                      | n/a                                                               |
| Very large diffs freeze the app                                           | Output caps, per-file line limit, file-count paging                                                                        | n/a                                                               |
| Secret exposure                                                           | Never read keys, tokens or `.env`; `gh auth status` without `--show-token`; masking filter on errors; no environment dumps | Other software on this account can still run `gh` itself          |
| Data sent to third parties                                                | No AI calls, no runtime CDN or fonts                                                                                       | `gh` sends the review text to GitHub; that is the purpose         |
| Wrong PR or duplicate posts                                               | Confirmation with repo, PR, title and head SHA; head must match; single-flight submit; no automatic retry                  | n/a                                                               |

Out of the threat model: other local users or processes running as you, a compromised `gh` or `git` binary, and a hostile `~/.gitconfig`.

## 10. Implementation plan (draft for tasks.md)

Each milestone leaves the app runnable, ends with green `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, and is one commit after your approval of its file list.

| #   | Milestone                | Scope                                                                                                                                 | Depends | Acceptance                                                                | Tests                                                                              |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 0   | Repository               | `git init`, `.gitignore`, keep `docs/` as is                                                                                          | n/a     | `git status` shows docs and openspec                                      | n/a                                                                                |
| 1   | Foundation               | Vite, React, TS, Fastify skeleton, loopback, token, Origin/Host checks, lint/test/Lefthook, self-hosted font                          | 0       | `pnpm dev` serves a page; tokenless request returns 403                   | Int: token, Origin, Host refusals                                                  |
| 2   | Workspace from fixtures  | Port renderer helpers, layout, file tree, compact, sections, folding, reviewed marks, sidebar resizer; fixture mode with `small.json` | 1       | Screenshot matches the original artifact's file view within tolerance     | Unit: tokenize, wordRange, toSplit, tree compression; e2e: interactions; visual    |
| 3   | Open repository          | Root config, path validation, safe Git runner, refs list, recents                                                                     | 1       | Valid repo opens; outside-root, missing and non-repo paths refused        | Int: temporary repos, symlink escape, injection strings                            |
| 4   | Compare and diff         | Ref resolution, merge base, name-status/numstat, per-file diff parser, wired to workspace                                             | 2, 3    | Fixture repo comparison equals `git diff` output; repo snapshot unchanged | Int: renames, binary, deleted, empty, no common history; unit: parser              |
| 5   | Scale and filter         | Line/file limits, oversized notice, file-list filter, persisted reviewed marks, performance check on a 1,000-file fixture             | 4       | 1,000-file comparison interactive within the agreed budget                | e2e and performance smoke test                                                     |
| 6   | Drafts                   | Line and range selection, overall comment, edit/delete, pending list, navigation, persistence, storage-failure state                  | 4       | Every review-drafts scenario except outdated                              | Unit: anchoring; e2e: draft flows; int: store                                      |
| 7   | PR identity and fetch    | `ls-remote` and fetch over SSH, `gh` readiness, `gh pr view`, head match, outdated re-check                                           | 4, 6    | PR shown; fetch writes no refs; outdated drafts marked                    | Int: local bare remote over `file://` for fetch logic, fake `gh`; manual SSH check |
| 8   | Submission               | Confirmation, single `gh api` call, result parsing, failure, outcome unknown and check, single-flight                                 | 7       | Every pr-review-submission scenario against fake `gh`                     | Int: fake `gh` success, 422, timeout, garbage output; e2e: confirm and cancel      |
| 9   | States and accessibility | Loading, empty and error states everywhere; keyboard pass; focus; 1024 px check                                                       | 2–8     | axe has no serious issues; keyboard-only flow passes                      | e2e accessibility                                                                  |
| 10  | Final verification       | Full suite, network audit, security tests, README, one manual submission to a throwaway test PR you own                               | all     | Specs' scenarios all mapped to passing tests                              | n/a                                                                                |

## 11. Testing and visual verification plan

- **Fidelity:** Playwright loads the original exported HTML in fixture state and saves baselines. The new app in fixture mode is compared at 1440×1180, ignoring regions for deferred features. The artifact's own copy is asserted verbatim.
- **Git correctness:** a test helper builds throwaway repositories (adds, edits, renames, binary files, deletes, diverged base, unrelated histories) and checks the app against `git diff` output.
- **Fetch:** logic is tested against a local bare remote using a `file://` URL. Real SSH is checked once by hand: an SSH failure with no agent key, and a missing PR ref.
- **`gh`:** a fake `gh` executable on `PATH` in tests records its arguments and stdin and returns scripted results (success, 404, 422, timeout, unparseable output, not signed in). **No live production PRs in automated tests.** The single manual live check uses a throwaway PR in a repository you own.
- **Security:** injection strings in every field; path traversal; foreign Origin and Host; tokenless calls; repository snapshot before and after; error-masking tests; network audit during e2e (only loopback is allowed in tests).
- **Drafts:** line and range association on both sides; edit, delete and persistence across restart; outdated transitions; duplicate-submit prevention.
- **Scale:** long paths, very long lines, 1,000-file and 20,000-line fixtures.
- **Accessibility:** keyboard-only flows, axe checks, 1024 px viewport.
- **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`.

## 12. Risks, assumptions, out of scope

**Risks**

- The local diff may differ from GitHub's if the merge base differs. Mitigation: use the PR's base commit from `gh` and the same 3-line context; GitHub's 422 is shown if a line is rejected.
- `refs/pull/*` exists only on GitHub remotes.
- Unreferenced fetched objects can be pruned by `gc`.
- SAML SSO orgs block `gh` until its token is authorised.
- The ported tokenizer is TypeScript-centric, so other languages colour less well.
- The deferred views are the artifact's main idea. v1 looks like a strong diff reviewer rather than "review in execution order" until an analyzer exists.

**Assumptions**

- Reviews target github.com.
- Remotes use SSH.
- One reviewer per machine.
- macOS first.
- Desktop browser at 1024 px or wider.

**Out of scope:** listed in the proposal.

## Files

- **Inspected:** the artifact (decoded in the scratchpad, never modified), `hosted-seats-app/openspec` for conventions, `gh` and `openspec` help output.
- **Created:**
  - `openspec/config.yaml` (from `init`, then given context and rules)
  - `openspec/specs/.gitkeep`, `openspec/changes/archive/.gitkeep`
  - `openspec/changes/local-pr-review-app/` with `.openspec.yaml`, `proposal.md`, `analysis.md` and five `specs/*/spec.md`
