# Proposal

Approved by: Akshay Kher, 2026-10-27 (proposal, specs and the two proposed defaults)

## Why

The artifact's **Map** tab was deferred from `local-pr-review-app`, because Git alone cannot say which code calls which. A reviewer looking at a pull request diff sees what changed, but not what depends on it or what it depends on. Etchpad's dependency map shows that kind of structure.

This change adds the analysis and brings the artifact's Map tab to life for TypeScript and JavaScript repositories: the changed functions of a pull request, the code that calls them and the code they call, laid out on one canvas.

## What Changes

- **Code analysis.** A local analyzer reads the head commit's TypeScript and JavaScript files from Git objects (never the working tree, never running any code). It builds a call graph with the TypeScript compiler and finds the functions each change touches.
- **Change neighbourhood.** The map shows every changed file, every changed function (new, signature changed, body changed), and their direct callers and callees. Nothing further out is included.
- **The artifact's Map view**, rebuilt:
  - `Diff` / `Map` switch in the header;
  - the dark canvas with directory, file and function boxes and call edges;
  - the `Architecture` / `Package` / `Module` / `Code` levels;
  - zoom from 50% to 160%;
  - the `Diff overlay` toggle and the legend;
  - the `Git` side panel;
  - the detail drawer with `Open in Diff view`.
- **Honest states:** analysing, no TypeScript or JavaScript changes, repository too large, and analysis failed. Each is told apart from the others.

## Capabilities

### New Capabilities

- `dependency-map`: the analysis of a comparison's change neighbourhood and the Map view that shows it.

### Modified Capabilities

None. (`review-workspace` from `local-pr-review-app` is not yet archived; the Map view's entry points into the workspace are specified in `dependency-map`.)

## Decisions taken

| Question                                  | Options                                                                                                      | Chosen                             | Why                                                                                                                                      | Cost to reverse                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| How much of the code the map covers       | (a) the change neighbourhood; (b) the whole repository                                                       | (a), chosen by the user 2026-10-27 | It focuses on the review, stays bounded on large repositories, and matches the artifact's Map                                            | Medium                                               |
| Languages                                 | (a) TypeScript and JavaScript via the compiler API; (b) more languages via tree-sitter                       | (a), chosen by the user            | Real symbol and call resolution for the team's repositories (Next.js, Payload)                                                           | Medium: other languages would be a separate analyzer |
| Order of execution (entry points → paths) | (a) map first, paths later; (b) both together                                                                | (a), chosen by the user            | Smaller, independently reviewable change; the call graph built here is what paths will reuse                                             | Small                                                |
| Where source comes from                   | (a) the working tree; (b) Git objects of the head (and merge base) commit                                    | (b)                                | Reviews exactly the compared commit, keeps the "file contents only from Git objects" rule, and works on commits that are not checked out | Small                                                |
| How functions are classified              | (a) changed lines only; (b) compare with the merge base: added, signature changed, body changed              | (b)                                | Same three kinds and colours as the artifact                                                                                             | Small                                                |
| Column order on the canvas                | (a) by entry-point depth (needs paths); (b) by call depth inside the neighbourhood (callers left of callees) | (b)                                | Paths are deferred; caller-before-callee layering gives the same left-to-right reading                                                   | Small                                                |

## Decisions needed

None. Both open questions were settled with the proposed defaults on 2026-10-27:

- repositories with more than 3,000 TypeScript and JavaScript files show `Repository too large for the map`;
- the map shows and sets file-level reviewed marks.

## Deferred

| Artifact element                                                                                       | Reason                                                                                                              |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `Order of execution` list, path filtering, `‹ ›` path stepping, dimming of nodes off the selected path | Follow-up change (paths), as chosen                                                                                 |
| `see this branch's changes`, `show diff to here` in the Git panel                                      | Placeholders in the artifact (they only toggle the overlay); the panel shows the base and head as the artifact does |
| `Pick a span of history` (commit-by-commit)                                                            | Placeholder copy in the artifact                                                                                    |

## Out of scope

Languages other than TypeScript and JavaScript; the whole-repository map; AI walkthroughs or summaries (no code leaves the machine); running or building the repository's code; editing code from the map.

## Impact

- `typescript` becomes a runtime dependency (pinned, already used for type checking) for the server-side analyzer.
- New server operation for the map, reading many Git objects per analysis (`git cat-file --batch`).
- New Map view in the client; the sample fixtures gain the artifact's call-path data so the Map can be compared with the original pixel for pixel.
