# Tasks

Every group ends with `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green and one commit, made only after the exact file list is shown and approved. `docs/` is never modified.

## 1. Repository

- [x] 1.1 Run `git init` on `main` and add `.gitignore` (node_modules, dist, coverage, test-results, playwright-report, .DS_Store, .env*); verify `git status` lists only `docs/`, `openspec/` and `.gitignore`
- [ ] 1.2 Commit `docs/` and `openspec/` unchanged as the baseline; verify the artifact's sha256 is `339b5658977d47d600cf0ec8b13b1fa95b43c60fab8996437cfcd858d3c4608a`

## 2. Foundation

- [x] 2.1 Create `package.json` (pnpm, Node 22 engines, scripts `dev`, `start`, `build`, `lint`, `typecheck`, `test`, `test:e2e`), `tsconfig` for client, server and shared code, and the folder layout from design D1/analysis §6; verify `pnpm install` and `pnpm typecheck` succeed
- [x] 2.2 Add ESLint (`curly`, arrow-function `func-style`), Prettier and a Lefthook pre-commit hook running lint and typecheck; verify that a file with a braceless `if` fails `pnpm lint`
- [x] 2.3 Add the start-up command with `--root` (default `~/Desktop/Personal-Space`), `--port` (default 4317) and realpath'd roots that fail fast when missing (D2); verify by integration tests for a missing root and a port already in use
- [x] 2.4 Serve Fastify on 127.0.0.1 with Vite in middleware mode for development and static `dist/client` for production, behind the Content Security Policy (D1, D3); verify `pnpm dev` and `pnpm build && pnpm start` each serve a placeholder page
- [x] 2.5 Add token generation, the printed `#token=` URL, and the client moving the token into `sessionStorage` and clearing the fragment (D2); verify by an end-to-end test that the URL has no fragment after load
- [x] 2.6 Add the `Host`, `Origin` and token hooks and the `POST`-only operation router with the shared zod contract, plus a `ping` operation (D3); verify by integration tests: missing token 403, wrong token 403, foreign `Origin` 403, rebinding `Host` 403, unknown operation 404, valid `ping` 200
- [x] 2.7 Add static-asset path containment; verify `/../package.json` and an encoded traversal return 404
- [x] 2.8 Self-host IBM Plex Mono and add `styles/tokens.css` with the artifact palette; verify the end-to-end network audit shows no request leaving loopback

## 3. Workspace from fixtures

- [x] 3.1 Extract `tests/fixtures/small.json` from the artifact's `SMALL` literal, and generate `large.json` from `buildLarge()` with a test-only script; verify the file counts are 11 and the large total equals the artifact's size note
- [x] 3.2 Port `tokenize`, `segments`, `wordRange` and `toSplit` to `src/client/diff/render.ts`; verify unit tests covering the pairing, unbalanced-runs, word-highlight (including the 70% cut-off) and fold-row scenarios against outputs recorded from the original functions
- [x] 3.3 Add fixture mode (`--fixture small|large`) serving `compare` and `fileDiff` from fixtures (D11); verify by integration test that both operations return fixture data
- [x] 3.4 Build the layout: sidebar, resizer, main header and section list, with all-files and selected-file modes, `Back to all files` and the adapted header copy; verify by end-to-end tests for the "Header for all files" and "Focus and return" scenarios
- [x] 3.5 Build the file tree with folder-chain compression, collapse, status marks, counts, tooltips and selection; verify by unit tests (compression) and end-to-end tests ("Folder chain compression", "Collapse a folder", "Long paths")
- [x] 3.6 Add `Compact` mode; verify by an end-to-end test of the "Toggle compact" scenario
- [x] 3.7 Build the section header, folding, language badge and side-by-side rows; verify by end-to-end tests of "Fold a section" and visual inspection of the hatch and word highlight
- [x] 3.8 Add file-level reviewed marks and the progress ring in memory; verify by end-to-end tests of the "Progress updates on review" and "Empty comparison" scenarios
- [x] 3.9 Port the sidebar resizer (240–760 px, ±24/±80 px steps, double-click reset to 360 px, drag highlight); verify by an end-to-end test of "Keyboard resize clamps" plus drag and double-click tests
- [x] 3.10 Add the Playwright visual baseline from the original HTML and the comparison against fixture mode (D12); verify the "Visual match on the sample comparison" scenario passes within `maxDiffPixelRatio: 0.02`

## 4. Open a repository

- [x] 4.1 Implement the process runner: `execFile`, binaries resolved at start-up, allowlisted environment, timeouts with SIGTERM then SIGKILL, output cap, closed stdin, secret masking (D4); verify unit tests for masking and integration tests for a timeout kill and an oversized output
- [x] 4.2 Add the `makeRepo()` test helper and the read-only snapshot helper (D12); verify a self-test that a no-op leaves the snapshot identical
- [x] 4.3 Add path validation and `openRepo` (realpath, root containment, top-level check) plus the recent-repositories store; verify integration tests for "Valid repository", "Outside the roots" (including a symlink escape), "Not a repository" and "Missing path", each showing that no Git process starts for refused paths
- [x] 4.4 Add `listRefs` (branches, remote branches, tags, remotes with GitHub URL parsing); verify an integration test against a repository with all three ref kinds and an HTTPS remote flagged non-SSH
- [x] 4.5 Build the repository picker and recents in the sidebar; verify an end-to-end test opening a test repository from the UI

## 5. Compare and diff

- [x] 5.1 Add ref validation and resolution with `--end-of-options`; verify integration tests for "Unknown ref", "Ambiguous abbreviated SHA" and injection strings (`--output=/tmp/x`, `-c core.pager=sh`) rejected before any process starts
- [x] 5.2 Implement `compare` (merge base, `-z` name-status and numstat joined, binary flag, comparison cache); verify the "Matches Git" scenario against the `git diff` commands on a fixture repository with adds, edits, a rename, a delete and a binary file
- [x] 5.3 Implement `fileDiff` with the row parser, hunk index, fold rows and the 3,000-row notice (D6), addressed by comparison id and file index; verify parser unit tests and a traversal test (`../../etc/passwd` refused)
- [x] 5.4 Verify the "Base moved on", "No common history" and "Identical commits" scenarios by integration tests
- [x] 5.5 Verify the "Repository-defined diff driver" scenario: a repository configuring an external diff and textconv driver that writes a marker file; the marker is never created
- [x] 5.6 Add the base and head pickers and wire live comparisons into the workspace, with lazy section loading; verify an end-to-end test comparing two branches of a test repository, with a snapshot equal before and after

## 6. Scale, filter and persisted marks

- [x] 6.1 Add the local store (location, mode 0700, atomic write, per-file serialisation, corrupt-file quarantine) (D8); verify integration tests for concurrent writes and a corrupt file being renamed and reported
- [x] 6.2 Persist reviewed marks per comparison; verify "Marks follow the comparison" and "Marks survive a restart" by end-to-end tests
- [x] 6.3 Add a file-list text filter, the binary and oversized notices with reviewable sections, and 1,000-file paging (paging dropped: the unpaged list of 1,000 files renders in about 0.9 s, see 6.4); verify end-to-end tests for "Binary or oversized file" and "Large comparison"
- [x] 6.4 Run the performance smoke test on a generated 1,000-file repository; verify the 1.5 s and 50 ms budgets, and add in-section windowing only if they fail

## 7. Drafts

- [x] 7.1 Add the draft model and store operations (`loadReviewState`, `saveDraft`, `deleteDraft`, `saveOverall`), keyed by PR or by comparison; verify integration tests for "Survives restart" and that nothing is written under the repository
- [x] 7.2 Add the gutter `+`, single-line drafts and shift-click ranges limited to one hunk and one side; verify end-to-end tests for "Single line", "Range", "Range across hunks refused" and "Empty text refused" on both sides
- [x] 7.3 Add the overall comment, editing, and deletion with confirmation; verify end-to-end tests for "Overall only", "Edit" and "Delete"
- [x] 7.4 Build the review drawer with the pending list, counts, states, jump-to-location and next/previous; verify end-to-end tests for "Jump to location" and "Next and previous"
- [x] 7.5 Add debounced autosave and the `Draft not saved` state; verify an end-to-end test of the "Storage failure" scenario with a read-only data folder
- [x] 7.6 Style drafts and submitted comments distinctly; verify an end-to-end test of the "Labelling" scenario

## 8. PR identity and fetch

- [x] 8.1 Add `fetchPr`: `ls-remote` for the PR head and base tip, then a fetch writing no refs, then SHA verification; verify by integration tests against a bare `file://` remote with `refs/pull/1/head`, covering "Fetch succeeds" (snapshot unchanged except objects), "PR ref missing" and "Remote is not SSH" (HTTPS URL refused before any process starts)
- [ ] 8.2 Map SSH authentication failures to a clear message; verify one manual check with the agent emptied (`ssh-add -D` in a throwaway shell), recorded in the task notes, plus a unit test of the stderr mapping — status: stderr mapping unit-tested (auth failure, unreachable host, other errors masked) and an unreachable-SSH-remote integration test passes; the manual agent-emptied check is left to the user, because emptying the SSH agent would disrupt their real session
- [x] 8.3 Add the fake `gh` (`tests/bin/gh`, scenario file, argument and stdin log) (D12); verify a self-test showing the recorded arguments
- [x] 8.4 Add `ghStatus` using `gh auth status --json hosts` with no token flag; verify integration tests for "Not installed" and "Not signed in" with the fake, and that its argument log never contains `--show-token`
- [x] 8.5 Add `readPr` and the PR panel, with owner and repository from the remote; verify integration and end-to-end tests for "Valid PR", "Invalid number" (no `gh` call made), "Not found or no access", and "Closed or merged PR" (extra confirmation shown)
- [x] 8.6 Add re-anchoring when the head changes, plus `Move here` (D9); verify unit tests and end-to-end tests for "Unchanged line" and "Moved or changed line"

## 9. Submission

- [x] 9.1 Add `prepareSubmission`, the request-body builder and the confirmation dialog (D10); verify unit tests for the body (sides, ranges, outdated drafts excluded) and end-to-end tests for "Cancel" (no `gh api` call in the fake log; the read-only `auth status` and `pr view` that build the confirmation are expected) and "Nothing to send"
- [x] 9.2 Add the head-match check; verify an end-to-end test of "PR moved on" with the fake `gh` returning a different head
- [x] 9.3 Add `submitReview` with lock, hash check, attempt record written before spawning, and a single `gh api` call; verify by integration test "Success" (the fake log shows exactly one call with the expected stdin JSON and `event: COMMENT`) and "Rejected by GitHub" (422, drafts untouched)
- [x] 9.4 Add outcome-unknown handling and `checkReviews`; verify integration tests for "Timeout then check", "Unexpected output" and an attempt left `submitting` by a restart reading as unknown
- [x] 9.5 Verify "Double click" by an end-to-end test that confirms twice quickly and finds exactly one submission in the fake log
- [x] 9.6 Show the result: a link from the `html_url` in `gh`'s response, and `gh`'s masked message on failure; verify end-to-end tests for success and failure, plus the "Token in error output" masking scenario

## 10. States and accessibility

- [x] 10.1 Add loading, empty and error states for every operation in the UI; verify an end-to-end test that forces each operation to fail through a test hook and checks for a visible message with no blank panel
- [x] 10.2 Do a keyboard and accessibility pass (focus rings, labels, `aria-pressed` and `aria-expanded`, dialog focus trap); verify the "Keyboard-only review" end-to-end test and axe with no serious or critical issues
- [x] 10.3 Verify the "Minimum width" scenario at 1024 px by an end-to-end test

## 11. Final verification

- [x] 11.1 Map every spec scenario to its test in `tests/SCENARIOS.md`; verify there are no unmapped scenarios
- [x] 11.2 Run the full gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, and the "Network audit" and "Repository unchanged" end-to-end runs; verify all green
- [x] 11.3 Write a README (prerequisites `git`, `ssh-agent` and `gh auth login`, start-up flags, the data folder, the security model, the fact that `gh` uses GitHub's APIs, and the deferred features); verify by following it in a fresh clone
- [ ] 11.4 Do one manual live submission to a throwaway PR in a repository you own, after your go-ahead; verify the review appears on GitHub with its inline comments, and record the URL in the task notes

## 12. Pull request links

- [x] 12.1 Parse GitHub pull request links in shared code; verify unit tests for links with paths, queries and fragments, and for repository, issue and non-GitHub links refused
- [x] 12.2 Add `findClones`: recents first, then a bounded scan of the roots for folders containing `.git` (no hidden folders, `node_modules` or build output; depth and folder caps), remotes read through Git, SSH remotes preferred; verify integration tests for one clone, several clones, none, a clone outside the roots ignored, and a nested clone found
- [x] 12.3 Accept a link in the repository field and start the pull request review from it, with a choice when several clones match; verify end-to-end tests for "Link to a cloned repository", "Several clones", "No clone" and "Not a pull request link"
