# Tasks

Each group ends with lint, typecheck, unit/integration tests and the affected end-to-end tests green. Nothing is committed until the user asks.

## 1. Fixtures

- [x] 1.1 Extend the fixture extraction with the artifact's `steps` and `diffs`, and regenerate `small.json` and `large.json`; verify the fixture tests compare the new fields with the artifact's own values

## 2. Source snapshot from Git

- [x] 2.1 Parse `git cat-file --batch` output by size; verify unit tests with contents holding newlines, empty files and missing objects
- [x] 2.2 Read a commit's source snapshot (`ls-tree`, extension and folder filters, count limit checked before reading, 400-path batches, 1 MB cap, `tsconfig.json` paths); verify integration tests that uncommitted edits are ignored, generated folders skipped, and a 3,001-file commit reported as too large without reading contents

## 3. Analyzer

- [x] 3.1 Index declarations (functions, methods, accessors, function-valued variables, top-level code) with ids and line ranges; verify unit tests on small sources
- [x] 3.2 Resolve calls (calls, `new`, JSX) through an in-memory compiler host, following import aliases and `tsconfig` paths; verify unit tests, including a host that refuses any path outside its map
- [x] 3.3 Classify changed functions (new, signature changed, body changed) against the merge base, with `+a −r`; verify unit tests per kind and for renamed files
- [x] 3.4 Run the analyzer in a worker thread with a time limit; verify an integration test that a `fileDiff` request is answered while a slow analysis runs, and that the time limit reports a failure

## 4. Neighbourhood and the map operation

- [x] 4.1 Build the neighbourhood and depth layering (one hop, cycles broken deterministically); verify unit tests for "Two hops away" and a cycle
- [x] 4.2 Add `dependencyMap` with caching and the states (`noSource`, `tooLarge`, `failed`), plus the fixture source built from `steps`; verify integration tests for "Changed function with a caller and a callee", "New function", "Non-code files", "Path aliases", "Only documentation changed", "Too large", "Syntax errors" and "Repository unchanged"

## 5. Layout

- [x] 5.1 Port the artifact's map geometry to `layoutMap`; verify the equivalence test against the original `mapVals` at all four levels with the overlay on and off

## 6. Map view

- [x] 6.1 Add map colour tokens (AA-checked), the `Diff` / `Map` switch, header copy and map workspace state; verify end-to-end tests for "Switch to the map" and "Analysis is not repeated"
- [x] 6.2 Draw boxes, nodes, edges and the legend with levels, zoom and `Diff overlay`; verify end-to-end tests for "Change level", "Zoom limits", "Overlay off", "Caller left of callee", and the visual match with the artifact at `Module` level
- [x] 6.3 Add selection, the detail drawer (folder, file, function), `Open in Diff view`, reviewed from the drawer, and sidebar selection in the Map view; verify end-to-end tests for "From map to diff" and "Reviewed from the map"
- [x] 6.4 Add the Git panel with its resizer; verify the end-to-end test "Toggle the panel"
- [x] 6.5 Show the map states; verify end-to-end tests for analysing, "Only documentation changed" and a failure

## 7. Final verification

- [x] 7.1 Run the performance check "Thousand-file repository" in the performance project; verify the 15 s budget
- [x] 7.2 Run axe on the Map view with the drawer open; verify no serious or critical issues
- [x] 7.3 Regenerate the scenario map (`pnpm scenarios`, extended to this change), update the README, and run the full gate twice; verify all green
