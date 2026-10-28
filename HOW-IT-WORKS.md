# How ArtifactForge works

This document walks through a full review session, from `pnpm start` to a posted review. For each
step it says what happens, why it is done that way, and where the code lives. The README covers
installing and running; this document covers the inner workings.

## The short version

ArtifactForge is two pieces on your laptop: a web page in your browser and a small server
(Node.js, Fastify) that only listens on `127.0.0.1`. The page shows the review. The server does
everything a browser page is not allowed to do: run `git` and `gh`, read your repositories and save
your drafts. GitHub is contacted only to fetch a pull request's commits and to post the review.

```
Browser tab (React page)
   │  HTTP to 127.0.0.1:4317, every request carries the start-up token
   ▼
Local server (Node.js + Fastify, src/server)
   ├─ git ─────────────▶ your local clone         (commits, diffs: no network)
   ├─ git over SSH ────▶ GitHub                   (PR commits, only when missing)
   ├─ gh ──────────────▶ GitHub                   (read PR; post the review after you confirm)
   ├─ TypeScript compiler (worker thread)         (the Map: no network)
   └─ JSON files ──────▶ your data folder         (drafts, reviewed marks, recent repositories)
```

## The pieces, and why each one exists

| Piece                      | What it does                                              | Why it is needed                                                                   |
| -------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Browser page (React, Vite) | Shows files, diffs, comments, the Map and the post dialog | A page is the quickest way to give the artifact's look and interaction             |
| Local server (Fastify)     | Runs `git` and `gh`, reads repositories, stores drafts    | A browser page cannot start programs or read your disk                             |
| `git`                      | Lists changed files, builds diffs, fetches PR commits     | Your clone already holds the history; Git computes the diff exactly as GitHub does |
| `gh` (GitHub CLI)          | Reads PR details and posts the review                     | Uses your existing GitHub login, so ArtifactForge never handles a token            |
| TypeScript compiler        | Finds functions and calls for the Map                     | Runs locally from Git objects; no code leaves the machine                          |
| Data folder (JSON files)   | Keeps drafts, reviewed marks and recent repositories      | Drafts survive restarts without any database or cloud service                      |

## Step by step

### Step 0: Check the machine (`pnpm run doctor`)

**What happens:** the doctor checks Node.js 22+, Git, the built page, the repository folders, the data
folder, the port, GitHub over SSH and the `gh` login, and prints a fix for each problem.

**Why:** a teammate who clones the project learns in one command what is missing, instead of meeting
it later as an error in the middle of a review. Only problems that stop the app from starting count
as failures; SSH and `gh` problems are warnings because they only affect pull request review.

**Code:** `src/server/doctor/`. Use `pnpm run doctor`; plain `pnpm doctor` is pnpm's own built-in
command.

### Step 1: Start the server (`pnpm start`)

**What happens:**

1. The configuration is read once (`src/server/config.ts`):
   - **Repository folders:** `--root`, else `ARTIFACTFORGE_ROOT`, else your home folder. Each folder is
     resolved to its real path. A missing folder stops start-up with a clear message.
   - **Data folder:** your platform's app data folder, unless `--data-dir` is given.
   - **Port:** 4317, unless `--port` is given.
   - **Programs:** `git` and `gh` are looked up on `PATH` once and remembered by their full path.
   - **Environment:** only a few variables are passed on to child processes: `PATH`, `HOME`, `USER`,
     `LANG`, `SSH_AUTH_SOCK` and `TMPDIR`.
2. A **session token** is created: `randomBytes(32)` from Node's `crypto`, encoded as base64url
   (`src/server/security/token.ts`). It exists only in the server's memory.
3. The server listens on **127.0.0.1 only** and prints
   `http://127.0.0.1:4317/#token=<token>`.

**Why:**

- **Programs are looked up once:** a later change to `PATH`, or a file planted in a repository, cannot
  swap in a different `git` or `gh`.
- **Only a few environment variables are passed on:** settings such as `GIT_DIR` or `GH_TOKEN` in your
  shell cannot change what the app does.
- **127.0.0.1 only:** other machines on your network cannot reach the app.
- **The token:** see step 2.

### Step 2: Open the page, and how requests are protected

**What happens:**

1. You open the printed address. The token sits after `#`, a part of the address that browsers
   never send to any server, so it does not appear in server logs.
2. The page moves the token into session storage and removes it from the address bar and history
   (`src/client/app/token.ts`).
3. Every request is `POST /api/op/<operation>` with the token in an `x-af-token` header
   (`src/client/app/api.ts`).
4. Before any work, the server checks each request (`src/server/security/request-guard.ts`):
   - **Host** must be `127.0.0.1:<port>` or `localhost:<port>`, which blocks DNS rebinding;
   - **Origin**, when present, must be the app's own address;
   - the **token** must match, compared in constant time (`timingSafeEqual`).
5. The operation name must be one of a fixed list (`src/shared/operations.ts`), and its input is
   validated with a zod schema before use.
6. Every answer has the same shape: `{ success: true, data }` or
   `{ success: false, error: { code, message } }`.

**Why:** any website open in your browser can send requests to `127.0.0.1`. Without these checks, a
malicious page could ask your local app for your code or try to post a review in your name. The
token proves the request comes from the tab you opened. The Host and Origin checks stop pages that
try to disguise themselves. The fixed operation list means the page can only ask for named actions,
never "run this command".

### Step 3: Open a repository or a pull request link

**What happens:**

- **A path:** the server resolves it to its real path (symlinks followed) and accepts it only if it
  is inside one of the repository folders and is a Git repository
  (`src/server/git/repository.ts`, `src/server/security/validate.ts`).
- **A PR link** (`https://github.com/<owner>/<repo>/pull/<n>`): the server looks for your local
  clone of that repository (`src/server/git/clone-finder.ts`):
  1. your recent repositories first;
  2. then a bounded search of the repository folders: up to 4 levels deep and 2,000 folders,
     skipping hidden folders, `node_modules`, `dist` and `build`;
  3. each candidate's remotes are read with `git` and compared with the link, preferring SSH remotes.

  One clone starts the review straight away, several clones let you pick, and no clone shows how to
  get one.

**Why:**

- **The app never downloads a repository:** it works only with clones you already have, so it never
  needs your credentials to clone.
- **The search is bounded:** a huge home folder cannot make it run for minutes.
- **Confinement to the repository folders after resolving symlinks:** a crafted path or link can
  never point the app at files elsewhere on your disk.

### Step 4: Read the pull request (`gh pr view`)

**What happens:** `gh` reads the PR's number, title, state, author, base and head branches and head
commit (`src/server/gh/pull-requests.ts`). `gh auth status` tells whether you are signed in, without
ever reading the token.

**Why:**

- **`gh` instead of a GitHub API client of our own:** `gh` already has your login, so ArtifactForge
  stores no credentials and has no OAuth app or GitHub App.
- **`gh` runs from the data folder, with the repository named explicitly:** it never guesses a
  repository from wherever it happens to run.
- **Signed out:** without a `gh` login, you can still compare branches, review and write drafts.

### Step 5: Get the pull request's commits (SSH, only when missing)

**What happens** (`src/server/git/pr-fetch.ts`):

1. The remote must be an SSH remote (`git@github.com:…`).
2. `git ls-remote` asks GitHub which commits `refs/pull/<n>/head` and the base branch point to now.
   Only commit IDs come back, no code.
3. If your clone already has both commits, nothing is downloaded.
4. Otherwise `git fetch` downloads just those commits with `--refmap=`, `--no-write-fetch-head`,
   `--no-tags` and `--no-recurse-submodules`: objects only, no branch, tag, remote-tracking ref or
   `FETCH_HEAD`.
5. Both commits are then confirmed to exist locally.

**Why:**

- **Fetching at all:** your clone usually lacks the PR's exact commits. The author may have pushed
  since your last pull, fork PRs never appear in your branches, and GitHub keeps PRs under
  `refs/pull/<n>/head`, which a normal fetch skips.
- **`ls-remote` every time:** you always review the PR's current head.
- **Skipping the download when nothing is new:** no network traffic is wasted.
- **Fetch flags:** they leave your branches, tags and working files exactly as they were.
- **SSH only:** your existing SSH key authenticates; Git is never allowed to prompt for a password
  (`GIT_TERMINAL_PROMPT=0`, `SSH_ASKPASS_REQUIRE=never`).

Comparing two of your own branches (Base and Head) skips steps 4 and 5 entirely and uses no network.

### Step 6: Compare (build the diff)

**What happens** (`src/server/git/git-comparisons.ts`, `src/server/git/changed-files.ts`,
`src/server/git/diff-parser.ts`):

1. `git merge-base <base> <head>` finds the common ancestor.
2. `git diff --name-status -M` and `git diff --numstat -M` list changed files, renames and line counts.
3. The comparison gets an id (`git:<hash>`) and is cached in memory, so later requests refer to it by
   id.
4. Each file's diff is produced only when the page asks for it, by **file index** (not by path), and
   parsed into rows: sign, old line, new line, text.
5. Every Git command runs with `core.hooksPath=/dev/null`, `core.fsmonitor=false`, `--no-ext-diff`
   and `--no-textconv`, through one process runner that uses no shell, has a timeout and caps output
   size (`src/server/security/run-process.ts`).

**Why:**

- **Merge base, as GitHub does:** you see only the changes the PR introduces, not changes made on the
  base branch since.
- **Diffs on demand:** opening a 1,000-file comparison stays fast.
- **File index, not path:** the page can never ask for an arbitrary file on disk.
- **Hardening flags:** opening someone else's repository cannot run their Git hooks or their
  configured diff programs on your machine.
- **No shell:** branch names or paths can never be interpreted as commands. A ref that looks like an
  option (`-x`) is refused before any process starts.

### Step 7: Review the files

**What happens:**

- **Sidebar:** the file tree, a filter, compact mode, and the progress ring (remaining `+a −r`).
- **Diffs:** side-by-side, with syntax colouring and word-level highlights, ported from the artifact
  (`src/client/diff/render.ts`).
- **Loading:** sections load their diff only when they come near the screen.
- **Reviewed marks:** marking a file reviewed saves it for this comparison in the data folder
  (`src/server/store/review-marks.ts`).

**Why:**

- **Rendering ported from the artifact:** the review looks the way the approved design does.
- **Loading near the screen:** large PRs stay responsive.
- **Marks saved per comparison:** a restart or a different PR never mixes up your progress.

### Step 8: Write comments (drafts)

**What happens:**

- **One line:** hover a line number and press **+**.
- **A range, as on GitHub:** press **+** and drag over more lines, or Shift-click another line's
  **+**. A range stays within one hunk on one side, as GitHub requires
  (`src/client/diff/use-line-drag.ts`).
- **Autosave:** the comment box saves as you type, 400 ms after you stop. The overall comment saves
  600 ms after you stop.
- **Anchoring:** each draft stores the file, side, line range, the head commit and the text of the
  lines it is attached to (`src/server/review/review-service.ts`).
- **When the PR moves on:** after new commits (press **Refresh**), each draft is checked again. If its
  lines are unchanged it moves with them. Otherwise it becomes **Outdated** and is left out of posting
  until you **Move** it to a line or delete it.
- **Storage:** drafts live in `reviews/<review key>.json` in the data folder, written atomically
  (temporary file, fsync, rename) and one change at a time per file
  (`src/server/store/json-store.ts`).

**Why:**

- **Autosave:** typing is never lost.
- **Anchoring by text:** a comment is never silently attached to the wrong code after a push.
- **Atomic writes:** a crash cannot leave a half-written drafts file.
- **Hunk rule:** GitHub would reject a range that crosses hunks or sides, so it is refused up front.

### Step 9: The Map (optional)

**What happens** (`src/server/map/`, `src/client/map/`):

1. The first time you open **Map** for a comparison, the server reads the TypeScript and JavaScript
   files of the **head commit** straight from Git objects (`git ls-tree`, `git cat-file --batch`).
   It skips `node_modules`, `dist`, `build`, `.next` and `coverage`, files over 1 MB, and
   repositories with more than 3,000 such files.
2. In a **worker thread**, the TypeScript compiler parses them in memory and finds every function and
   which functions call which, following imports and `tsconfig` path aliases. The time limit is
   60 seconds.
3. The diff decides which functions changed: new, signature changed, or body changed.
4. The map keeps the changed functions plus their direct callers and callees, ordered by call depth.
5. The page lays it out with geometry ported from the artifact (`src/client/map/layout.ts`):
   Architecture, Package, Module and Code levels, with the diff overlay.
6. The result is cached for the comparison, so reopening the Map does not analyse again.

**Why:**

- **Git objects, not your working folder:** the map shows exactly the commit under review, ignoring
  uncommitted edits.
- **In-memory compiler, no build:** the repository's code is never run, built or installed.
- **Worker thread:** the server keeps answering diff requests while a big analysis runs.
- **One hop of callers and callees:** keeps the map readable and focused on what the change touches.

### Step 10: Post the review (only after you confirm)

**What happens** (`src/server/review/submission-service.ts`):

1. **Prepare:** **Post review…** asks the server to build the exact review. The dialog shows the
   repository, PR, branches, head commit, the **Comment** action, your account and the number of
   comments. The server returns a `prepId`, a hash of exactly that content.
2. **Confirm:** nothing is sent until you press **Post review**.
3. **Submit:** the server checks that:
   - the PR head is still the commit you reviewed;
   - the review still hashes to the same `prepId`;
   - no other submit for this review is running (a lock).

   It then **records the attempt in the data folder before** running one
   `gh api POST repos/<owner>/<repo>/pulls/<n>/reviews` that creates one Comment review with all
   inline comments at once.

4. **Outcome:**
   - **Submitted:** the drafts are marked submitted, with a link to the review.
   - **Failed:** GitHub's message is shown, with token-shaped text masked, and the drafts are kept.
   - **Unknown** (timeout, unreadable output, or the app stopped mid-post): posting is blocked until
     you press **Check GitHub for this review**, which looks for your review on GitHub before
     allowing a retry.

**Why:**

- **Confirm first:** nothing is ever posted without an explicit action and confirmation.
- **The `prepId` hash:** what is posted is exactly what you saw in the dialog, not something that
  changed afterwards.
- **The lock, plus recording the attempt first:** a double click, or a crash mid-post, cannot post
  the same review twice.
- **Comment reviews only:** the app never approves or requests changes automatically.

## Where your data lives

| What                           | Where                                                        |
| ------------------------------ | ------------------------------------------------------------ |
| Drafts, overall comment, posts | `<data folder>/reviews/<review key>.json`                    |
| Reviewed marks                 | `<data folder>/marks/<comparison>.json`                      |
| Recent repositories            | `<data folder>/recent.json`                                  |
| PR commits                     | Your clone's Git object store (no refs are written)          |
| Session token                  | Server memory and the tab's session storage; gone on restart |

The data folder is `~/Library/Application Support/ArtifactForge` on macOS,
`~/.local/share/artifactforge` on Linux and `%APPDATA%\ArtifactForge` on Windows (`--data-dir`
overrides it). It is created with mode 0700.

## What reaches the network

| When                         | Command                        | Sends                                 | Receives                 |
| ---------------------------- | ------------------------------ | ------------------------------------- | ------------------------ |
| Opening or refreshing a PR   | `git ls-remote` over SSH       | The two ref names                     | Two commit IDs           |
| Only if commits are missing  | `git fetch` over SSH           | The ref names                         | Those commits            |
| Reading the PR               | `gh pr view`, `gh auth status` | Repository and PR number              | PR details, login status |
| Only after you confirm       | `gh api …/reviews` (one call)  | Your comments and the overall comment | The created review       |
| Check GitHub for this review | `gh pr view --json reviews`    | Repository and PR number              | The PR's reviews         |

Nothing else. The page loads no third-party scripts or fonts, the Map runs locally, and no code or
comment is sent to any AI or other service.

## Questions people ask

**Why is there a local server at all?** A browser page cannot run programs or read your disk. The
server is the only part that touches `git`, `gh` and your files, and it only exposes a fixed list of
validated operations.

**Why Fastify?** It is just the HTTP library for that local server. It gives request hooks (where
the token, Host and Origin checks live), safe static-file serving, `pino` logging and the
development middleware. It runs entirely on your machine; plain `node:http` would also work, with
more code written by hand.

**How is the token made, and is it a GitHub token?** It is 32 random bytes from Node's `crypto`,
made fresh on every start and never written to disk. It has nothing to do with GitHub; it only
proves that a request comes from the tab you opened.

**Why does a PR need a fetch when the clone is local?** Your clone usually does not have the PR's
latest commits (new pushes, forks, `refs/pull/<n>/head`). The app checks first and downloads only
what is missing; comparing your own branches never uses the network.

**Why `gh` and not a direct GitHub API integration?** `gh` already holds your login, so
ArtifactForge never sees a token and needs no OAuth app. `gh` only reads (`auth status`, `pr view`)
and makes one approved call that creates the review.

**Does anything change in my repository?** Only new Git objects from the PR fetch, which Git stores
anyway on any fetch. No branch, tag, remote-tracking ref, `FETCH_HEAD`, configuration, stash, index or
working file is changed; the test suites check this with snapshots before and after.

**Why not Docker?** It is possible, but it would need your repositories mounted, your SSH agent
forwarded and your `gh` login inside the container, and Docker Desktop itself is a licensed download.
The native setup (`pnpm install`, `pnpm build`, `pnpm run doctor`, `pnpm start`) needs only Node.js,
Git, SSH and `gh`.

## Code map

| Step                        | Main files                                                                |
| --------------------------- | ------------------------------------------------------------------------- |
| Doctor                      | `src/server/doctor/`                                                      |
| Start-up, configuration     | `src/server/index.ts`, `src/server/config.ts`                             |
| Token and request checks    | `src/server/security/token.ts`, `src/server/security/request-guard.ts`    |
| Operation contracts         | `src/shared/operations.ts`, `src/server/routes/`                          |
| Running `git` and `gh`      | `src/server/security/run-process.ts`, `src/server/git/`, `src/server/gh/` |
| Opening repositories, links | `src/server/git/repository.ts`, `src/server/git/clone-finder.ts`          |
| PR fetch                    | `src/server/git/pr-fetch.ts`                                              |
| Compare and diffs           | `src/server/git/git-comparisons.ts`, `src/client/diff/`                   |
| Drafts and anchoring        | `src/server/review/`, `src/server/store/`, `src/client/drafts/`           |
| Map                         | `src/server/map/`, `src/client/map/`                                      |
| Posting                     | `src/server/review/submission-service.ts`, `src/client/submit/`           |
