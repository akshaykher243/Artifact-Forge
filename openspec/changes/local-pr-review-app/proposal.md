# Proposal

Approved by: Akshay Kher, 2026-10-26 (proposal, specs and proposed defaults)

## Why

The prflow review UI exists only as an exported Claude Design artifact: one HTML bundle, driven by hardcoded sample data, with no way to open a real repository and no way to leave feedback. Turning it into a maintainable local app lets a reviewer open a real local clone, compare a PR's refs with Git over SSH, mark progress, write line-level feedback, and post it to the PR through `gh` only after confirming exactly what will be sent and where.

## What Changes

- A local app (browser UI plus a loopback-only local service) that rebuilds the artifact's layout, visual language and diff interactions from source, without the Claude Design runtime.
- Repository selection limited to configured root folders; base/head ref selection; an explicit "fetch PR refs over SSH" action; changed files, stats and a side-by-side diff computed by local Git.
- Inline comments on a single line or a line range, plus one overall review comment, kept as local drafts that can be edited and deleted, listed as pending, and linked back to their diff location.
- Review submission as a **Comment** review through one allowlisted `gh api` call, after a confirmation step that names the repository, PR number, title, head commit and counts. The actual `gh` result is shown; an uncertain outcome is never retried silently.
- Security boundary: loopback binding, per-session token, fixed command allowlist, argument validation, no shell, no arbitrary file access, no secrets in logs, no external AI services.

## Capabilities

### New Capabilities

- `review-workspace`: the review screen rebuilt from the artifact: sidebar, file tree, compact mode, progress, resizable panels, side-by-side diff, folding, reviewed marks.
- `local-git-comparison`: opening a local repository, choosing refs, fetching PR refs over SSH, and producing changed files and diffs, read-only.
- `review-drafts`: inline and overall feedback as local drafts, their pending list, navigation, persistence and outdated handling.
- `pr-review-submission`: identifying the target PR with `gh`, confirming, submitting a Comment review, and reporting the real outcome.
- `local-service-security`: the trust boundary between browser and local service, and the rules every Git and `gh` invocation obeys.

### Modified Capabilities

None (no existing specs).

## Decisions taken

| Question                                             | Options                                                                                                                           | Chosen                                                                     | Why                                                                                                                                          | Cost to reverse                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Source of the "Order of execution" paths and the Map | (a) Git-only v1, defer; (b) read a prflow report file; (c) build a TypeScript analyzer                                            | (a), chosen by the user 2026-10-26                                         | No prflow analyzer exists on this machine; Git cannot produce entry points or call graphs                                                    | Medium: the deferred views come back as their own change once a data source exists |
| How inline comments reach GitHub                     | (a) one allowlisted `gh api` call creating a review with its comments; (b) `gh pr review` only, inline notes folded into the body | (a), chosen by the user                                                    | `gh pr review` has no inline-comment option (checked against gh 2.97.0 help). (a) is a REST call made through `gh` and is documented as such | Small                                                                              |
| Review actions                                       | Comment / + Request changes / + Approve                                                                                           | Comment only, chosen by the user                                           | Lowest risk; approve and request-changes never happen by accident                                                                            | Small                                                                              |
| Where drafts and reviewed marks live                 | (a) in the repository; (b) browser storage; (c) a per-user app data folder                                                        | (c)                                                                        | The repo must not be modified, and browser storage is per-origin and easy to lose                                                            | Small                                                                              |
| How a repository is chosen                           | (a) free path entry; (b) path entry limited to configured root folders                                                            | (b)                                                                        | A browser cannot hand over a real path, and free entry would expose arbitrary folders                                                        | Small                                                                              |
| Where the PR head comes from                         | (a) a local branch; (b) the PR's head commit fetched over SSH with no ref written                                                 | (b)                                                                        | Reviews the exact commit GitHub shows, and touches no branch                                                                                 | Small                                                                              |
| Syntax colouring                                     | (a) keep the artifact's tokenizer; (b) adopt a full highlighter                                                                   | (a) for v1                                                                 | Visual fidelity first; a highlighter can be a later change                                                                                   | Small                                                                              |
| Root folders for reviewable repositories             | Any folder list                                                                                                                   | `~/Desktop/Personal-Space` by default, overridable at start-up             | Proposed default, approved 2026-10-26                                                                                                        | Trivial                                                                            |
| Reviewed-mark persistence                            | (a) in memory, as the artifact does; (b) persisted per comparison                                                                 | (b), approved 2026-10-26                                                   | Losing review progress on reload defeats the progress ring                                                                                   | Small                                                                              |
| GitHub hosts                                         | (a) github.com only; (b) also GitHub Enterprise                                                                                   | (a), approved 2026-10-26                                                   | No GHE target is known. SAML SSO is the user's `gh auth` setup; the app shows `gh`'s message                                                 | Small                                                                              |
| Copy where the deferred paths used to be             | Keep path copy / adapt                                                                                                            | `All files`, `<n> changed files`, `Back to all files`, approved 2026-10-26 | The artifact's copy names paths that v1 does not have                                                                                        | Trivial                                                                            |

## Decisions needed

None.

## Deferred (artifact elements not built in v1)

| Artifact element                                                                               | Reason                                                                                             |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Order of execution` list, entry-point kinds, path filtering, `Remaining` by function          | Needs call-path data Git cannot provide                                                            |
| `Not reached by any entry point` groups                                                        | Same                                                                                               |
| `Map` tab: Architecture/Package/Module/Code levels, zoom, `Diff overlay`, edges, detail drawer | Same                                                                                               |
| `Git` panel span picker (`Pick a span of history…`)                                            | Placeholder copy in the artifact, no behaviour                                                     |
| `Small diff` / `Large diff` switch                                                             | A demo switch between two sample datasets, not product behaviour; the samples become test fixtures |
| `Whole file` on a function section                                                             | Belongs to function sections, which are deferred                                                   |

## Out of scope

Approving or requesting changes; showing existing GitHub review threads; replying to or resolving threads; pushing, checking out or editing code; creating PRs; discovering open PRs without a PR number; CI status, labels and reviewers; non-GitHub hosts; any AI analysis of code.

## Impact

- New app in this folder: a browser UI and a local Node service, managed with pnpm.
- Runtime dependencies on the user's own `git`, `ssh`/ssh-agent and `gh` (installed and signed in).
- `docs/` is untouched; the artifact's sample datasets are extracted into test fixtures.
