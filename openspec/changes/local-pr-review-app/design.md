# Design

## Context

See `proposal.md` for why, and the five specs for required behaviour. `analysis.md` holds the evidence: the artifact inventory, the `gh` capability check, and the threat model this design implements.

Constraints that shape the approach:

- **The artifact is a Claude Design bundle, not reusable source.** Its pure helpers (`tokenize`, `segments`, `wordRange`, `toSplit`) and its state model port to TypeScript; its runtime, template syntax and inline styles do not.
- **The browser cannot run Git or `gh`,** so a local process must. That process sits next to a browser that also visits arbitrary websites.
- **The folder is empty except for `docs/` and `openspec/`,** and it is not yet a Git repository.
- **Toolchain on this machine:** Node 22, pnpm 10, git 2.50, gh 2.97.

## Goals / Non-Goals

**Goals:**

- One process, one origin: the service serves both the UI and the operations, so the token, `Origin` and `Host` checks hold in development too.
- The browser never decides a command line. It names an operation and supplies validated values.
- What the reviewer confirms is exactly what gets sent.
- A `git diff` result reaches the screen through the artifact's own row format, so the ported renderer is unchanged.
- Every external effect is observable in tests through real temporary repositories and a fake `gh`.

**Non-Goals:**

- Multi-user or remote hosting, and authentication beyond the per-session token.
- Windows or Linux support (macOS only for v1; nothing is deliberately platform-locked except the data-folder path).
- A plug-in point for the deferred analyzer. It is added when a data source exists.
- Server-side rendering.

## Decisions

### D1. One Node process: Fastify plus Vite

- **Production:** Fastify serves the built UI from `dist/client` and operations under `/api/op/<name>`. The server itself runs from source through `tsx`; only the UI is built.
- **Development:** the same Fastify instance mounts Vite in middleware mode, giving one port, one origin and the same security hooks.
- **Alternatives:**
  - Next.js route handlers: more framework, server rendering not needed, and subprocess code inside the web framework.
  - A separate Vite dev server with a proxy: two origins, so the `Origin`/`Host` rules would need development exceptions.
  - Electron: heavier, and a desktop shell was not requested.

### D2. Start-up, port and token

- **Command:** `pnpm start [--root <dir>]... [--port 4317] [--fixture small|large]`.
- **Root:** `--root` (may repeat), else the folders in `ARTIFACTFORGE_ROOT` (separated like `PATH`), else the home folder, so a fresh clone runs on any teammate's machine. `--root` may repeat. Each root is resolved with `realpath` at start-up, and a missing root aborts start-up with a clear message (no silent fallback).
- **Port:** 4317 by default. A port already in use aborts start-up.
- **Bind address:** `127.0.0.1` only.
- **Token:**
  - 32 random bytes, base64url, regenerated on every start.
  - Printed as `http://127.0.0.1:4317/#token=<t>`. The fragment never reaches server logs.
  - The UI copies it into `sessionStorage` (tab-scoped, survives reload) and clears the fragment with `history.replaceState`.
- **Alternative:** a cookie set on first load. Rejected because cookies ride along on cross-site form posts; a header does not.

### D3. Operation API

- **Request format:** every operation is `POST /api/op/<name>` with `Content-Type: application/json` and an `X-AF-Token` header. A cross-origin page therefore cannot send it without a CORS preflight, and no CORS headers are ever returned.
- **Hooks before routing:** check `Host` equals `127.0.0.1:<port>` or `localhost:<port>`, then `Origin` (if present) is that same origin, then the token (constant-time compare). Any failure returns 403 with no body detail.
- **Shared contract:** `src/shared/operations.ts` declares each operation's zod input and output schema. Both sides import it, and the client's typed `call(name, input)` is generated from it.
- **Operations:**
  - `openRepo`, `listRefs`, `compare`, `fileDiff`, `fetchPr`
  - `ghStatus`, `readPr`, `prepareSubmission`, `submitReview`, `checkReviews`
  - `loadReviewState`, `saveDraft`, `deleteDraft`, `saveOverall`, `setReviewed`
- **Static assets:** served from the asset folder only. Paths are normalised and must stay inside it, otherwise 404.
- **Content Security Policy:** `default-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'`. Production also sets `script-src 'self'` and `form-action 'none'`. Development adds `'unsafe-inline'` to `style-src` and `script-src` (Vite injects inline styles and the React Refresh preamble) and allows the hot-reload websocket on the same host and port.

### D4. Process runner

- **One function, `run(bin, args, opts)`,** built on `child_process.execFile` with no shell.
- `bin` is one of two absolute paths, resolved once at start-up with `which git` and `which gh`.
- `args` are produced only by per-operation builder functions from validated values.
- **Limits:**

  | Setting                        | Value                                           |
  | ------------------------------ | ----------------------------------------------- |
  | Timeout, local Git             | 30 s                                            |
  | Timeout, fetch and `ls-remote` | 120 s                                           |
  | Timeout, `gh`                  | 60 s                                            |
  | On timeout                     | SIGTERM, then SIGKILL after 2 s                 |
  | Output cap                     | 64 MB (`maxBuffer`)                             |
  | stdin                          | Closed unless the operation passes request data |

- **Environment:**
  - Built from an allowlist of the parent's variables: `PATH`, `HOME`, `USER`, `LANG`, `SSH_AUTH_SOCK`, `TMPDIR`. Every other `GIT_*` or `GH_*` variable is dropped, so a stray `GIT_DIR` cannot redirect a command.
  - Fixed values added: `GIT_TERMINAL_PROMPT=0`, `GIT_PAGER=cat`, `GIT_OPTIONAL_LOCKS=0`, `LC_ALL=C`, `SSH_ASKPASS_REQUIRE=never`, `GH_PROMPT_DISABLED=1`, `GH_NO_UPDATE_NOTIFIER=1`, `GH_PAGER=cat`, `NO_COLOR=1`.
- **Git prefix:** `-C <repo> -c core.hooksPath=/dev/null -c core.fsmonitor=false`. Diffs add `--no-ext-diff --no-textconv --no-color`.
- **`gh` working directory:** the app data folder, so `gh` never infers a repository from the working directory.
- **Errors:** stderr is passed through `maskSecrets` (patterns `gh[pousr]_[A-Za-z0-9]{36,}` and `github_pat_\w{22,}`) and trimmed to 2 KB before it reaches the UI or logs.
- **Logging:** the operation name, duration and exit code only. Never arguments that contain comment text, and never environments.
- **Exact commands:** `analysis.md` §7 and §8 are the authoritative per-operation command templates.

### D5. Validation rules

| Input           | Rule                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository path | Absolute, then `realpath`, must equal or sit under a root, and `git rev-parse --show-toplevel` must equal the resolved path.                                                             |
| Ref             | 1–255 characters, no leading `-`, no control characters, no space, `~`, `^`, `:`, `?`, `*`, `[`, `\`, `..` or `@{`; or 4–64 hex characters. Then resolved with `--end-of-options`.       |
| File path       | Must be in the changed-file list of the comparison the server holds for that request. The client sends a comparison id plus a file index, never a free path.                             |
| PR number       | An integer from 1 to 10⁹.                                                                                                                                                                |
| Remote          | Must be a configured remote whose URL parses as `git@github.com:<owner>/<repo>(.git)` or `ssh://git@github.com/<owner>/<repo>(.git)`. Owner and repo must match `[A-Za-z0-9._-]{1,100}`. |
| Comment text    | 1–65,536 characters after trimming. It is sent only inside the JSON body piped to `gh api --input -`.                                                                                    |

### D6. Comparison model and diff format

- **Comparison:** `compare` returns `{ id, repoKey, baseSha, headSha, mergeBase, files[] }`.
  - The id is a hash of `repoKey + mergeBase + headSha`, and the server keeps the comparison in an in-memory LRU of 20.
  - `repoKey` is the sha256 of the repository's real path.
  - The file list is parsed from `-z --name-status -M` and `-z --numstat -M`, joined by path. Binary files show `-` in numstat and are flagged `binary`.
- **Per-file diffs** load lazily through `fileDiff(id, index)` when a section scrolls near the viewport. The diff is parsed into the artifact's row format `[sign, oldNo, newNo, text]` with a `hunk` index per row.
- **Fold rows:** a `['~', null, null, '<n> unchanged lines']` row is inserted for the gap before the first hunk, between hunks, and after the last hunk when the new file's line count is known. This reproduces the artifact's fold rows.
- **Size limits:** a file over 3,000 diff rows, or a binary file, returns `{ notice }` instead of rows. The file list is not paged: measured at 1,000 files it renders in about 0.9 s (task 6.4); paging is added only if a larger comparison misses the budget.
- **Alternatives:**
  - A diff library's object model: it would need an adapter to the artifact's renderer anyway.
  - Full-file context (`-U99999`): breaks GitHub's line-in-hunk rule for comments, and hurts large files.

### D7. UI structure

The renderer is ported first, faithful to the artifact, then wired to live data.

- `src/client/diff/render.ts` holds `tokenize`, `segments`, `wordRange` and `toSplit`, ported nearly verbatim and typed. The 70% rule and colour values stay identical.
- `styles/tokens.css` defines every colour, size and font as custom properties taken from the artifact (for example `--ink #1D2330`, `--accent #2B50D6`, `--add-bg #EAF6EE`, `--del-bg #FDEDED`, `--hatch`). CSS Modules use only these tokens.
- IBM Plex Mono 400/500/600 is self-hosted from `@fontsource/ibm-plex-mono`.
- **Approved deviation (2026-10-27):** seven text colours from the artifact fail WCAG AA contrast. They are darkened with the same hue to reach at least 4.5:1: muted text, line numbers, the language badge, and the string, number, literal, type and comment syntax colours. `tokens.css` marks each with its original value. The visual test against the artifact still passes within its 2% tolerance.

Components:

| Component       | What it shows                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Sidebar`       | Comparison picker (new; uses the artifact's segmented-control and input styling where the `Small diff`/`Large diff` switch was), progress row, `Files` tree |
| `Resizer`       | Port of `resizer()`: pointer capture, arrow keys, double-click reset                                                                                        |
| `Main`          | Header, sections list                                                                                                                                       |
| `Section`       | Header, split rows, comment gutters                                                                                                                         |
| `ReviewDrawer`  | The artifact's right drawer pattern (white aside, 280–900 px, default 520, resizable): pending review, overall comment, submit                              |
| `ConfirmDialog` | Native `<dialog>`, focus-trapped                                                                                                                            |

- **State:** one `useReducer` per concern: workspace UI (selection, folds, compact, widths), comparison data, and review (drafts, reviewed marks, submission state). Drafts are optimistic in the UI and saved with a 400 ms debounce; a failed save shows `Draft not saved`.
- **Commenting:**
  - A `+` button appears in the line-number cell on hover or focus of any hunk row.
  - Click starts a single-line draft. Shift-click on another row of the same hunk and side extends it to a range.
  - The editor renders as a full-width row under the range's last line.
  - Draft rows use a dashed border and a `Draft` label; submitted ones are solid with `Submitted` and a link.
- **Rendering at scale:** sections render on demand by viewport proximity. Windowing inside a single section is added only if the 1,000-file performance check (task 6.4) fails.

### D8. Local store

- **Location:** the platform's per-user data folder, created with mode 0700: `~/Library/Application Support/ArtifactForge/` on macOS, `$XDG_DATA_HOME/artifactforge` (or `~/.local/share/artifactforge`) on Linux, `%APPDATA%\ArtifactForge` on Windows. `--data-dir` overrides it.
- **Files:**
  - `recent.json`: recently opened repositories.
  - `reviews/<repoKey>/pr-<n>.json`, or `cmp-<mergeBase>-<headSha>.json` when no PR is set: `{ version: 1, target, headSha, overall, drafts[], submissions[] }`.
  - `marks/<repoKey>/<mergeBase>-<headSha>.json`: reviewed paths.
- **Writes:** write to a temporary file in the same folder, `fsync`, then `rename`, serialised per file in-process. A corrupt file is renamed `*.corrupt-<time>` and reported, never silently dropped.
- **Draft:** `{ id, path, side: 'old' | 'new', startLine, endLine, headSha, anchorText[], body, state: 'draft' | 'outdated' | 'submitted', submittedReviewUrl? }`.
- **Alternatives:** SQLite (more than needed); `localStorage` (per-origin, so it is lost when the port changes).

### D9. Outdated re-anchoring

When `headSha` changes, each draft whose state is `draft` is checked against the new file diff:

- **Kept:** the same path exists, and rows on the same side at `startLine..endLine` exist in one hunk with text equal to `anchorText`. The draft moves to the new head.
- **Outdated:** anything else, including a renamed path. The draft keeps its text.

The reviewer re-anchors an outdated draft by choosing **Move here** on a line, which applies the same in-hunk rule.

### D10. Submission protocol

1. **`prepareSubmission(repoKey, pr)`:**
   - Runs `gh auth status --json hosts --hostname github.com` and `gh pr view`.
   - Checks that the PR head equals the comparison head.
   - Builds the exact request body from the stored drafts (`draft` state only) and the overall comment:
     - side `new` becomes `RIGHT`, side `old` becomes `LEFT`
     - `line` is `endLine`; `start_line` and `start_side` are added only for ranges
   - Returns a summary plus `prepId`, which is a hash of that body. The confirmation dialog shows the summary.
2. **`submitReview(prepId)`:**
   - Takes a per-(repo, PR) lock; a second call while locked returns `busy`.
   - Rebuilds the body from the store and refuses with `Review changed, confirm again` if its hash differs from `prepId`.
   - Calls `gh pr view` again and refuses with `PR has new commits` if the head moved.
   - Appends `{ attemptId, startedAt, state: 'submitting', bodyHash }` to `submissions[]` and saves it **before** spawning, so a crash leaves a recoverable record.
   - Runs `gh api --method POST repos/<o>/<r>/pulls/<n>/reviews --input -`.
3. **Outcomes:**

   | `gh` result                                                  | App state                                                    |
   | ------------------------------------------------------------ | ------------------------------------------------------------ |
   | Exit 0 and output parses as `{ id, html_url }`               | `submitted`; included drafts become `submitted` with the URL |
   | Non-zero exit                                                | `failed`, with the masked message; drafts untouched          |
   | Timeout, a killed process, or exit 0 with unparseable output | `unknown`                                                    |
   | App restart while an attempt is still `submitting`           | Read as `unknown` on next load                               |

4. **`checkReviews(repoKey, pr, attemptId)`:**
   - Runs `gh pr view --json reviews`.
   - A match is a review by the signed-in login, submitted no earlier than `startedAt` minus 2 minutes (to allow for clock skew), whose body equals the sent body. When the sent body was empty, a single review by that login in the window also matches.
   - On a match, the attempt and drafts become `submitted`. No match leaves `unknown` resolvable only by the reviewer choosing `Try again`, which repeats from step 1.
5. **Alternatives:**
   - `gh pr review --comment` plus separate inline posts: not atomic, so a partial failure would cause duplicates.
   - A pending review followed by a submit: two calls, and the pending review would be visible on GitHub in between.

### D11. Fixture mode

`--fixture small|large` replaces the Git source with fixtures extracted from the artifact. `small.json` is the `SMALL` literal; `large.json` is the output of `buildLarge()`, generated once by a test-only script. The same operations are served, and `fetchPr`, `readPr` and the submission operations are disabled. Fixture mode exists for screenshot tests and UI development only.

### D13. Pull request links

- **Parsing** lives in `src/shared/pull-request.ts`, so the browser can tell a link from a path before calling the service.
- **`findClones(owner, name)`** looks at recently opened repositories first, then scans the roots breadth-first:
  - it goes at most 4 levels deep and visits at most 2,000 folders;
  - it skips hidden folders, `node_modules`, `dist` and `build`;
  - a folder is a candidate when it contains a `.git` entry.
- **Matching.** Remotes are read with `git config --get-regexp` (the same as `listRemotes`), four repositories at a time. A clone matches when a remote's GitHub owner and name equal the link's, ignoring case; an SSH remote is preferred over HTTPS.
- **Resolved clone.** The client opens the clone through `openRepo`, which re-validates the path and records it as recent, then starts the review with the matched remote and number, exactly as the `Pull request` form does.
- **Alternatives:** indexing every repository at start-up (slower start, stale results), or asking for the path as well as the link (the link alone is the point).

### D12. Testing approach

| Layer                   | Approach                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (Vitest)           | Ported renderer, diff parser, `-z` parsers, validators, re-anchoring, request-body builder, secret masking                                                                                                                                                                                                                            |
| Integration (Vitest)    | A `makeRepo()` helper builds real repositories in a temporary folder from a small DSL (commits, renames, binary files, diverged base), plus a bare remote reached through `file://` for fetch logic                                                                                                                                   |
| Fake `gh`               | A `tests/bin/gh` Node script on `PATH` reads a scenario file named by `AF_FAKE_GH_SCENARIO`, records its arguments and stdin to a log, and replies with scripted results                                                                                                                                                              |
| Read-only proof         | A snapshot helper captures `for-each-ref`, `status --porcelain=v2`, `.git/config`, `stash list` and `HEAD` before and after each integration test                                                                                                                                                                                     |
| End-to-end (Playwright) | Runs the app on a free port with a test root and the fake `gh`. Network requests to anything other than loopback fail the test                                                                                                                                                                                                        |
| Visual                  | The original HTML is opened from `docs/` with Google Fonts routed to the local font files. File `src/lib/money.ts` is selected and compared at 1440×1180 against the app in `--fixture small` with the same file, using `maxDiffPixelRatio: 0.02` and masking the deferred `Order of execution` region and the comparison-picker area |
| Performance smoke test  | `--fixture large` and a generated 1,000-file repository: file list visible within 1.5 s of the compare response, and a median key-event duration (Event Timing API: processing plus next paint) under 50 ms in both the file filter and a comment box. Runs as its own Playwright project after the main suite                        |

## Risks / Trade-offs

- **[Local diff differs from GitHub's]** → The merge base is computed from the PR's `baseRefOid` (fetched), using GitHub's default 3-line context. GitHub's 422 message is shown, and the drafts survive it.
- **[An unknown submission outcome needs a human decision]** → The `attempt` record is written before spawning, and the body-and-time match resolves most cases automatically.
- **[Fetched commits held by no ref can be pruned by `git gc`]** → `compare` checks the commits exist and offers `Fetch again`.
- **[A Content Security Policy without inline styles]** → All dynamic values go through CSS custom properties set via the React `style` prop, which the policy allows because it is not a `<style>` element or attribute string. The production build is verified free of policy violations in end-to-end tests.
- **[The token can be read by other processes on the same account]** → Accepted. Anything running as the user can run `gh` directly anyway.
- **[The ported tokenizer is TypeScript-centric]** → Accepted for v1; a different highlighter is a later change.
- **[v1 lacks the artifact's headline feature]** → Accepted by decision. The deferred views are tracked in the proposal.

## Migration Plan

This is a new app with nothing to migrate. Rollback means stopping the process. The app data folder can be deleted to clear drafts and marks.

## Open Questions

None that change the specs, the approach or the tasks.
