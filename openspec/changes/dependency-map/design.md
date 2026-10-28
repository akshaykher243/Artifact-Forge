# Design

## Context

See `proposal.md` for why and `specs/dependency-map/spec.md` for the behaviour. This builds on `local-pr-review-app`:

- the comparison cache (merge base, head, changed files, per-file diffs);
- the process runner with its fixed argument templates;
- the workspace state and contexts;
- the ported artifact renderer.

The artifact's Map logic (`mapVals` in the exported script) is the reference for layout, levels, colours and the drawer.

Constraints:

- File contents may come only from Git objects.
- No repository code may run.
- The service must stay responsive while analysing.
- `typescript` is pinned at 6.0.3; version 7, the native compiler, has no JavaScript API.

## Goals / Non-Goals

**Goals:**

- One analysis per comparison, reused across switches between Diff and Map.
- Layout and drawing identical to the artifact for the same graph, checked by running the artifact's own `mapVals`.
- The analyzer cannot read the disk: its compiler host serves only the files it was given.

**Non-Goals:**

- Type-checking the repository or reporting its errors.
- Following calls into `node_modules`.
- Dynamic dispatch beyond what the type checker resolves statically (callbacks passed as values, `obj[key]()` calls).
- Persisting analyses across restarts.

## Decisions

### D1. Source snapshot from Git

- **Listing.** `git ls-tree -r -z --name-only <commit>` lists files. Source files are kept by extension, skipping `.d.ts`, `node_modules` and generated folders. The count is checked against the 3,000 limit _before_ any content is read.
- **Reading.** Contents come from `git cat-file --batch`, with `<commit>:<path>` lines on standard input, in chunks of 400 paths per process. Each record is `<sha> blob <size>\n<bytes>\n` and is parsed by size, so contents containing newlines are safe.
- **Skipped files.** Files over 1 MB are skipped and treated as having no functions.
- **`tsconfig.json`** is read the same way from the head commit. `extends` is not followed, because it usually points into `node_modules`; `compilerOptions.baseUrl` and `paths` are used.
- **The merge base** is read only for the comparison's changed source files, to classify functions.
- **Alternative rejected:** reading the working tree. It's faster, but it breaks the "Git objects only" rule and can show code that isn't the head commit.

### D2. Analyzer in a worker thread

`analyzeMap(input)` runs in a `worker_threads` worker started with `execArgv: ['--import', 'tsx']`, so the same TypeScript sources run in development, production and tests.

**Input:** a map of path to text at the head commit, the merge-base texts of the changed files, the changed files' diff rows, and the `tsconfig` options.

**Program setup.** The worker builds a `ts.createProgram` over all source files with an in-memory `CompilerHost`. Its `fileExists`, `readFile`, `getSourceFile` and `directoryExists` answer only from that map, so nothing is read from disk. Options:

| Option             | Value                                 |
| ------------------ | ------------------------------------- |
| `noLib`            | `true`                                |
| `allowJs`          | `true`                                |
| `jsx`              | `preserve`                            |
| `module`           | `esnext`                              |
| `moduleResolution` | `bundler`                             |
| `types`            | `[]`                                  |
| `baseUrl`, `paths` | From the repository's `tsconfig.json` |

**Output:** functions and edges, defined below. A time limit (60 s) terminates the worker, and the map then shows the failure.

**Alternatives rejected:**

- Running in the main thread: blocks every request for seconds.
- Spawning `tsc` in a child process: no call-graph output.

### D3. Functions and calls

**Declarations.** Function declarations, class methods and accessors, and variables initialised with an arrow function or function expression. Names are `name` or `Class.method`. Each function's id is `<path>#<name>`; a second declaration with the same name gets `#<name>:<line>`. Code at a file's top level that makes calls becomes `<path>#(top-level)`, labelled `top-level code` as in the artifact.

**Calls.** Call expressions, `new` expressions and JSX elements are resolved through `checker.getSymbolAtLocation`, following import aliases to the declaration. A call counts when that declaration is a known function in the snapshot. The caller is the innermost enclosing function, or the file's top level.

**Changed functions.** A head function contains an added line (`+`) or a context line between removed lines of the diff. It is:

| Kind                | When                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `new function`      | The same id did not exist in the merge-base version of the file (or of its old path, for a rename) |
| `signature changed` | Its parameter list or return-type text changed, with whitespace normalised                         |
| `body changed`      | Otherwise                                                                                          |

`+a −r` count the diff rows inside the function. Functions deleted from the head are not shown.

### D4. Neighbourhood and depth

- **Nodes:** changed functions, plus every function with an edge to or from one of them.
- **Edges:** every call edge between two nodes.
- **Depth:** longest path from a node with no incoming edge, starting at 1. Cycles are broken by depth-first discovery order, so the result is deterministic because functions are visited in path and line order.
- **Folders:** a folder's column is `min(maxDepth, 3) - 1`, or the last column when it has no functions. These are the artifact's rules.

### D5. The map operation and fixture data

- **`dependencyMap({ comparisonId })`** returns either a ready map or a state:
  - **Ready:** `{ state: 'ready', sourceFileCount, functions: [{ id, name, file, line, change, add, del, depth, preview }], edges: [{ from, to }] }`.
  - **Otherwise:** `{ state: 'noSource' | 'tooLarge' | 'failed', ... }`.
- **Caching.** Results are kept in a small cache (8 entries) next to the comparison cache. Two requests for the same comparison share one analysis.
- **Fixture mode** builds the same model from the artifact's own `steps` and `diffs`, so the client and layout are tested against exactly the data the artifact drew. The fixtures are re-extracted to include `steps` and `diffs`.

### D6. Layout port

`layoutMap(model, view)` in `src/client/map/layout.ts` is the artifact's `mapVals` geometry, ported as a pure function. `view` holds the level, overlay, zoom, selection and reviewed paths. It returns folder and file boxes, nodes, edges (curve paths with their end dot) and the canvas size.

The artifact grouped functions by its `steps`; the port takes the D5 model instead. A unit test feeds the artifact's `steps` to both the original `mapVals` (run from `docs/` as in `tests/fixtures/artifact.ts`) and the port, and requires identical boxes, nodes and edges at every level, with the overlay on and off.

### D7. Map UI

| Component   | Ported from                 | Notes                                                                            |
| ----------- | --------------------------- | -------------------------------------------------------------------------------- |
| `MapView`   | The artifact's map section  | Toolbar: levels, zoom, `Diff overlay`, `Git` and the note                        |
| `GitPanel`  | The artifact's left panel   | Resizable 200–560 px                                                             |
| `MapCanvas` | The artifact's canvas       | Absolutely positioned boxes and nodes inside a scaled stage, edges as inline SVG |
| `MapDrawer` | The artifact's right drawer | Resizable 280–900 px                                                             |

- **Dark map colours** become tokens (`--map-*`), checked against WCAG AA like the rest.
- **Workspace state** gains `view`, `level`, `zoom`, `overlay`, `gitOpen`, `mapSelection`, `gitWidth` and `drawerWidth`.
- **Sidebar file clicks** in the Map view dispatch "select in map" instead of "select in diff".
- **Nodes** are buttons with `aria-pressed`. Arrow keys are not added in this change; Tab order follows layout order.

### D8. Testing

| Layer       | What is tested                                                                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | `cat-file` batch parsing; declaration indexing, classification and call resolution on small in-memory TypeScript programs (aliases, JSX, methods, default exports); depth layering with cycles; layout equivalence with the artifact                  |
| Integration | `dependencyMap` on real temporary repositories: the change scenarios; uncommitted edits ignored; `tsconfig` paths; too large (3,001 tiny files, counted only); syntax errors; repository unchanged; a `fileDiff` answered while a large analysis runs |
| End-to-end  | Switch to Map, levels, zoom, overlay, the Git panel, the drawer and `Open in Diff view`, reviewed from the drawer, states; a visual comparison with the artifact's Map at `Module` level                                                              |
| Performance | The 1,000-file repository within 15 s, in the separate performance project                                                                                                                                                                            |

## Risks / Trade-offs

- **[Worker start-up with `tsx` costs about a second]** → Paid once per analysis; results are cached.
- **[Large monorepos near the limit may take tens of seconds]** → Progress text, the time limit, and the 3,000-file cap.
- **[Calls through callbacks or dynamic access are missed]** → Accepted and stated in the README; the map is a reading aid, not proof of completeness.
- **[`noLib` means some library-typed calls do not resolve]** → Those calls are dropped anyway, since only repository functions matter.
- **[Visual tolerance on a canvas with many thin edges]** → The pixel comparison covers the `Module` level of the small sample only; geometry equivalence is checked exactly by the unit test.

## Migration Plan

This is additive and has no data migration. Rollback means hiding the `Map` switch.
