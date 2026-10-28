# Spec Delta

## Purpose

Shows a comparison's change neighbourhood as the artifact's Map: the changed files and functions of TypeScript and JavaScript code, the code that calls them and the code they call, laid out by call order with the diff as an overlay.

## ADDED Requirements

### Requirement: Map view

The workspace header SHALL offer a `Diff` / `Map` switch, with the active one marked by `aria-pressed`. In the Map view the header SHALL read `Diff overlay` as crumb, `<head> vs <base>` as heading and `<repo>, directory map` as subheading. The map SHALL be analysed only when the Map view is first opened for a comparison, and switching back to `Diff` SHALL keep the diff exactly as it was.

#### Scenario: Switch to the map

- **WHEN** the reviewer presses `Map` on a comparison of `main` and `feature/currency`
- **THEN** `Map` is pressed, the heading reads `feature/currency vs main`, and the canvas replaces the diff

#### Scenario: Analysis is not repeated

- **WHEN** the reviewer opens the map, returns to `Diff` and opens the map again
- **THEN** the map is shown without analysing the comparison a second time

### Requirement: Analyse from Git objects only

The analysis SHALL read TypeScript and JavaScript files (`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, not `.d.ts`) of the head commit, and of the merge base for classification, from Git objects only. It SHALL skip `node_modules` and generated folders (`dist`, `build`, `.next`, `coverage`), use the repository's `tsconfig.json` path settings when present, never run or build the repository's code, and never read the working tree.

#### Scenario: Working tree differs from the commit

- **WHEN** a file in the working tree has uncommitted edits that add a call
- **THEN** the map reflects the head commit, without that call

#### Scenario: Repository unchanged

- **WHEN** the map is analysed
- **THEN** a snapshot of refs, `git status --porcelain` and `.git/config` taken before and after is identical, and no repository script has run

#### Scenario: Path aliases

- **WHEN** the repository's `tsconfig.json` maps `@/lib/*` to `src/lib/*` and a changed file imports `@/lib/money`
- **THEN** calls into `src/lib/money.ts` are resolved like relative imports

### Requirement: Change neighbourhood

The map SHALL contain every changed file of the comparison, and every function, method or function-valued variable of a TypeScript or JavaScript file that the diff changes, classified as `new function` (not present at the merge base), `signature changed` (its parameters or return type changed) or `body changed`. It SHALL also contain each function that directly calls a changed function and each function in the repository that a changed function directly calls, labelled `unchanged`. Calls into `node_modules` or the standard library SHALL NOT appear.

#### Scenario: Changed function with a caller and a callee

- **WHEN** `formatMoney` in `src/lib/money.ts` changes its parameters, `OrderSummary` calls it and it calls `toMinorUnits`
- **THEN** the map shows `formatMoney` as `signature changed`, `OrderSummary` and `toMinorUnits` as `unchanged` unless they changed too, and edges `OrderSummary → formatMoney → toMinorUnits`

#### Scenario: New function

- **WHEN** the head adds `toMinorUnits`, which does not exist at the merge base
- **THEN** it is shown as `new function`

#### Scenario: Two hops away

- **WHEN** a function calls a direct caller of a changed function, but not the changed function itself
- **THEN** it is not on the map

#### Scenario: Non-code files

- **WHEN** the comparison changes `docs/money.md` and `package.json`
- **THEN** both appear as file boxes with no functions

### Requirement: Levels

The map SHALL offer the levels `Architecture`, `Package`, `Module` and `Code`, starting at `Module`:

| Level          | Nodes                                                   | Details shown on each node                                                                                                      |
| -------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Architecture` | One per folder                                          | `<n> files · <m> functions`                                                                                                     |
| `Package`      | One per file, inside folder boxes                       | `<n> functions`                                                                                                                 |
| `Module`       | One per function, inside file boxes inside folder boxes | The kind (`new function`, `signature changed`, `body changed` or `unchanged`), `+a −r` and a `✓` on functions in reviewed files |
| `Code`         | As `Module`, with taller nodes                          | The first two changed lines, prefixed `+` or `−`                                                                                |

Edges SHALL connect the nodes of the current level and merge when several calls join the same two nodes; a call inside one node SHALL NOT draw an edge.

#### Scenario: Change level

- **WHEN** the reviewer picks `Package`
- **THEN** `Package` is pressed, functions are folded into their files, and edges join files

#### Scenario: Calls inside one folder

- **WHEN** at `Architecture` two functions in the same folder call each other
- **THEN** no edge is drawn for that call

### Requirement: Layout

Folders SHALL be placed in columns by call depth inside the neighbourhood: a folder whose functions call into another folder's functions stands to its left (at most four columns, a cycle broken by first discovery). A folder with no functions SHALL go in the last column. A column taller than the canvas limit SHALL wrap into an extra column. Each edge SHALL be a curve from the caller's right edge to the callee's left edge with a dot at the callee end, drawn in the artifact's colours.

#### Scenario: Caller left of callee

- **WHEN** functions in `web/components` call functions in `src/lib`
- **THEN** the `web/components` folder box is left of the `src/lib` folder box

#### Scenario: Artifact sample

- **WHEN** the map renders the artifact's small sample at `Module` level
- **THEN** a screenshot matches the original artifact's Map at `Module` level within the agreed pixel tolerance

### Requirement: Diff overlay and legend

With `Diff overlay` on (the default), new functions and files SHALL be green, changed ones amber, unchanged ones grey, and nodes SHALL show `+a −r`. With it off, every node SHALL be grey without counts. A legend SHALL read `new`, `changed`, `unchanged` and `calls`, and the toolbar SHALL show `<n> changed functions`.

#### Scenario: Overlay off

- **WHEN** the reviewer turns `Diff overlay` off
- **THEN** every node is grey, no node shows counts, and `Diff overlay` is not pressed

### Requirement: Zoom

The toolbar SHALL offer zoom out (`−`), a reset button showing the zoom as a percentage, and zoom in (`+`), in steps of 15% between 50% and 160%; the canvas SHALL scroll when larger than its area.

#### Scenario: Zoom limits

- **WHEN** the reviewer presses zoom in nine times from 100%
- **THEN** the reset button reads `160%` and further presses change nothing

### Requirement: Selection and detail drawer

Selecting a node SHALL ring it and open a resizable drawer on the right (280 to 900 pixels, 520 by default, closed with `Close panel`):

| Selected node | Drawer shows                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| Folder        | Its changed files with `+a −r`; picking one switches to `Package` and selects that file                             |
| File          | Its diff in one column, a `Mark reviewed` checkbox, and `Open in Diff view`, which opens that file in the Diff view |
| Function      | `<file>:<line>`, its changed lines, and `Open in Diff view` for its file                                            |

Selecting a file in the sidebar while in the Map view SHALL switch to `Package` and select that file.

#### Scenario: From map to diff

- **WHEN** the reviewer selects `formatMoney` and presses `Open in Diff view`
- **THEN** the Diff view shows `src/lib/money.ts` alone

#### Scenario: Reviewed from the map

- **WHEN** the reviewer marks a file reviewed in the drawer
- **THEN** the file is reviewed everywhere: the sidebar, the progress ring, the Diff view, and the `✓` on its functions

### Requirement: Git panel

A `Git` toggle SHALL show or hide a resizable panel on the left of the canvas (200 to 560 pixels, 300 by default), which reads `Showing all of <head>, the reference is ref:<base>` and lists the head and base commits with their short SHAs.

#### Scenario: Toggle the panel

- **WHEN** the reviewer presses `Git`
- **THEN** the panel hides, `Git` is not pressed, and the canvas widens

### Requirement: Map states

While analysing, the canvas SHALL read `Analysing <n> files…`. It SHALL read:

- `No TypeScript or JavaScript changes to map.` when the comparison changes no such file;
- `Repository too large for the map (<n> source files; the limit is 3,000).` when the head holds more source files than the limit;
- the analysis error, masked, when it fails.

Each of these SHALL still show the changed files as file boxes, except on failure.

#### Scenario: Only documentation changed

- **WHEN** the comparison changes only Markdown files
- **THEN** the canvas shows the files and reads `No TypeScript or JavaScript changes to map.`

#### Scenario: Too large

- **WHEN** the head commit holds 3,001 TypeScript and JavaScript files
- **THEN** no analysis runs and the canvas reads `Repository too large for the map (3,001 source files; the limit is 3,000).`

#### Scenario: Syntax errors

- **WHEN** a changed file does not parse
- **THEN** the map is still drawn from what parsed, and that file shows as a file box with no functions

### Requirement: Map within budget

For a repository of 1,000 TypeScript files, the map SHALL be ready within 15 seconds of opening the Map view on this machine class, and the analysis SHALL NOT block other operations of the service.

#### Scenario: Thousand-file repository

- **WHEN** the Map view opens for a comparison in a generated 1,000-file repository
- **THEN** the map is drawn within 15 seconds and a `fileDiff` request made during the analysis is answered
