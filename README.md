# ArtifactForge

A local-first pull request review app. It shows a pull request's changes as a side-by-side diff in the
look of the prflow review artifact (`docs/`), lets you write inline and overall comments as local
drafts, and posts them to the pull request as one GitHub **Comment** review, only after you confirm
what will be sent and where.

How a review session works step by step, and why each part is built the way it is, is explained in
[HOW-IT-WORKS.md](HOW-IT-WORKS.md).

Everything runs on your machine. Repository changes come from your local Git clone; the pull
request's commits are fetched over your SSH remote; the GitHub CLI (`gh`) reads the pull request
and posts the review.

## Prerequisites

| Tool                           | Why                                         | Check                                           |
| ------------------------------ | ------------------------------------------- | ----------------------------------------------- |
| Node.js 22+ and pnpm 10        | Runs the app                                | `node -v`, `pnpm -v`                            |
| Git                            | Reads and compares commits                  | `git --version`                                 |
| An SSH key loaded in the agent | Fetches pull request commits from GitHub    | `ssh-add -l`, `ssh -T git@github.com`           |
| GitHub CLI, signed in          | Reads the pull request and posts the review | `gh auth status` (sign in with `gh auth login`) |

Without `gh` you can still open repositories, compare refs, review diffs and write drafts; only
reading pull request details and posting need it. Your SSH key and your `gh` login are separate:
the SSH key authenticates `git fetch`, and `gh` uses its own login. If the repository's
organisation enforces SAML single sign-on, authorise the `gh` login for it (`gh auth refresh`).

## Run

```sh
pnpm install
pnpm build
pnpm run doctor   # checks everything below and says how to fix what is missing
pnpm start
```

Use `pnpm run doctor`, not `pnpm doctor`, which is pnpm's own check of its setup. The doctor checks
Node.js, Git, the built UI, the repository folders, the data folder, the port, SSH access to GitHub
and the `gh` login. It exits with an error only for problems that stop the app from starting; the SSH
and `gh` checks only affect pull request review. It takes the same `--root`, `--port` and
`--data-dir` flags as `pnpm start`.

To skip `--root` on every start, set the folder that holds your clones once, for example in
`~/.zshrc`: `export ARTIFACTFORGE_ROOT=~/code` (several folders are separated by `:`).

Run these inside the Git clone: `pnpm install` also installs the pre-commit hook (Lefthook), which
needs a Git repository.

The app prints an address such as `http://127.0.0.1:4317/#token=…`. Open that exact address: the
token in it is what lets your browser talk to the app, and it changes every time the app starts.

| Flag                     | Default                                      | Meaning                                                                                  |
| ------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `--root <dir>`           | `$ARTIFACTFORGE_ROOT`, else your home folder | Only repositories inside this folder can be opened. Repeat for several folders.          |
| `--port <n>`             | `4317`                                       | Port on 127.0.0.1.                                                                       |
| `--data-dir <dir>`       | your platform's app data folder (see below)  | Where drafts, reviewed marks and recent repositories are kept.                           |
| `--fixture small\|large` | none                                         | Serve the artifact's sample data instead of a repository (development and visual tests). |
| `--dev`                  | off                                          | Development mode with hot reload (`pnpm dev`).                                           |

The data folder is `~/Library/Application Support/ArtifactForge` on macOS,
`$XDG_DATA_HOME/artifactforge` (or `~/.local/share/artifactforge`) on Linux, and
`%APPDATA%\ArtifactForge` on Windows.

## Review a pull request

1. Paste the pull request link (for example
   `https://github.com/TechHoldingLLC/asur-website/pull/39`) and press **Open**. The app finds your
   local clone of that repository inside the root folders (it never downloads one), asks you to
   pick one if there are several, and goes straight to step 2. You can also enter a clone's path
   and press **Open**.
2. Under **Pull request**, pick the GitHub remote and enter the number, then **Review pull request**
   (done for you when you opened a link).
   The app reads the pull request with `gh`, fetches its commits over SSH, and compares them the way
   GitHub does (changes on the head since its merge base). No branch, tag or other ref is written.
3. Review the files. Mark files reviewed; the ring shows progress. Hover a line number and press
   **+** to comment on it; drag from **+** down (or up) over more lines, or Shift-click another line's
   **+**, to comment on a range in the same hunk. Comments are saved
   as you type, on this machine only.
4. Open **Review** for the overall comment and the list of pending comments.
5. **Post review…** shows exactly what will be posted: repository, pull request, branches, head
   commit, the Comment action, the account, and the number of comments. Nothing leaves the machine
   until you press **Post review**.

If the pull request gets new commits, press **Refresh**: comments whose lines are unchanged move to
the new commit; the others become **Outdated** and are left out of posting until you **Move** them
to a line or delete them. If posting times out or `gh` reports something unreadable, the outcome is
shown as unknown and the app will not post again until you **Check GitHub for this review**.

Without a pull request, **Base** and **Head** compare any two refs (branches, tags or SHAs).

## Map

**Map** in the header shows the change as the artifact's dependency map: the changed TypeScript and
JavaScript functions, the functions that call them and the ones they call, in folder and file boxes
laid out from callers on the left to callees on the right. Levels go from **Architecture** (one box
per folder) to **Code** (each function's first changed lines); **Diff overlay** colours new code
green and changed code amber. Select a node for its details, mark a file reviewed, or open it in the
Diff view; in the Map view, picking a file in the sidebar selects it on the map.

The map is worked out on this machine with the TypeScript compiler, from the head commit and the
merge base read out of Git: it never runs or builds the repository's code and ignores uncommitted
edits. It is analysed once per comparison, the first time **Map** is opened, and is not drawn for a
head commit holding more than 3,000 TypeScript and JavaScript files.

## What leaves your machine

- **Git over SSH** to the remote you chose, when you review a pull request or press **Refresh**:
  `ls-remote` (which commits the pull request and its base point to), then `fetch` only when your
  clone does not already have those commits. Nothing is pushed.
- **`gh`** to github.com: `gh auth status` and `gh pr view` (read the account and the pull request),
  and, only after you confirm, one `gh api` call that creates the review with all its comments at
  once. `gh` talks to GitHub's APIs; ArtifactForge has no GitHub API client of its own, stores no
  credentials and never reads your token or SSH keys.
- Nothing else. The page loads no third-party scripts or fonts, and no code or comment is sent to
  any AI or other service. The map's analysis runs locally and makes no network requests.

## Security model

- The server listens on 127.0.0.1 only and refuses requests without the start-up token, from
  another origin, or with an unexpected `Host` (DNS rebinding).
- The browser can only name one of a fixed list of operations; every input is validated, and the
  server runs `git` and `gh` without a shell from a fixed set of argument patterns. A ref that looks
  like an option is refused before any process starts.
- Repository paths are confined to the root folders after following symlinks; file contents only
  ever come from Git objects of the comparison, addressed by index, never by path.
- Git runs with repository hooks, fsmonitor, external diff tools and text converters turned off,
  and reviewing never changes the working tree, index, branches, tags, remote-tracking refs,
  configuration or stashes.
- Token-shaped strings are masked in every error shown or logged; logs never contain command
  arguments, comment text or environments.

Out of scope: other software running as you (it could run `gh` itself), a compromised `git` or
`gh`, and your own global Git configuration.

## Develop

| Command                                 | What it does                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`                              | Server and UI with hot reload (`pnpm dev --fixture small` for sample data).           |
| `pnpm lint`, `pnpm typecheck`           | ESLint and TypeScript.                                                                |
| `pnpm test`                             | Unit and integration tests (Vitest): real temporary Git repositories and a fake `gh`. |
| `pnpm test:e2e`                         | End-to-end tests (Playwright), then the timing budgets on their own.                  |
| `pnpm exec playwright install chromium` | Once per machine, before the first `pnpm test:e2e`: downloads the test browser.       |
| `pnpm run doctor`                       | Checks this machine's prerequisites and says how to fix what is missing.              |
| `pnpm scenarios`                        | Rebuilds `tests/SCENARIOS.md`; fails if a spec scenario has no test.                  |
| `pnpm build`                            | Builds the UI into `dist/client`.                                                     |

Automated tests never reach GitHub or your `gh` login: a fake `gh` (`tests/bin/gh`) always comes
first on their `PATH`, and pull request fetching is tested against a local bare repository behind
a GitHub-style SSH URL.

Behaviour is specified in `openspec/changes/local-pr-review-app/` and
`openspec/changes/dependency-map/`, and `AGENTS.md` describes the code layout and conventions.

## Not in this version

The artifact's **Order of execution** paths (and the map's path stepping that goes with them) and
the Git span picker. The map covers TypeScript and JavaScript only. Also not included: approving or requesting changes, showing existing GitHub review threads, and hosts other
than github.com.
