# Spec Delta

## Purpose

The review screen: a sidebar of changed files with progress, and a side-by-side diff, rebuilt from the prflow artifact's layout and interactions over real Git data.

## ADDED Requirements

### Requirement: Layout matches the artifact

The workspace SHALL show a left sidebar and a main area separated by a resize handle, with the artifact's monospace typeface, colours, spacing and border treatment. The sidebar SHALL show, top to bottom, the comparison summary, the progress row, and the `Files, <n>` list. The main area SHALL show a header with a small crumb, a bold heading and a muted subheading, above a scrolling diff area.

#### Scenario: Visual match on the sample comparison

- **WHEN** the workspace renders the artifact's small sample comparison at 1440×1180 with nothing selected
- **THEN** a screenshot matches the approved baseline taken from the original artifact's file view within the agreed pixel tolerance, ignoring the deferred `Order of execution` block

#### Scenario: Header for all files

- **WHEN** no file is selected
- **THEN** the crumb reads `All files`, the heading reads `<n> changed files` and the subheading names the base and head refs

### Requirement: Progress row

The sidebar SHALL show `Remaining` followed by the added and removed line totals of files not yet marked reviewed, a `Compact` toggle, and a progress ring with a percentage equal to the reviewed share of all changed lines, rounded to a whole number.

#### Scenario: Progress updates on review

- **WHEN** a comparison has two files with 10 and 30 changed lines and the reviewer marks the 10-line file reviewed
- **THEN** `Remaining` drops by that file's added and removed counts and the ring shows `25%`

#### Scenario: Empty comparison

- **WHEN** the comparison has no changed files
- **THEN** the ring shows `0%`, `Remaining` shows `+0` and `−0`, and the diff area shows an empty-state message instead of sections

### Requirement: File tree

The file list SHALL show the changed files as a tree sorted by name, with single-child folder chains merged into one row (for example `apps/web/app`). Folder rows SHALL collapse and expand. Each file row SHALL show a status mark (`+` in green for added, `●` in orange for modified, `●` in grey for renamed, `−` in red for deleted), the file name with its full path as tooltip, and `+a −r`, or `Reviewed` once marked. The selected file SHALL use the selected-row background.

#### Scenario: Folder chain compression

- **WHEN** the only changed file under `services/orders` is `services/orders/src/routes.ts`
- **THEN** one folder row reads `services/orders/src` and the file row reads `routes.ts`

#### Scenario: Collapse a folder

- **WHEN** the reviewer activates a folder row
- **THEN** its descendants are hidden, its caret changes from `▾` to `▸`, and `aria-expanded` becomes false

#### Scenario: Long paths

- **WHEN** a file path is longer than the sidebar width
- **THEN** the name is truncated with an ellipsis, the counts stay visible, and the full path is available as the row's tooltip

### Requirement: File filter

The sidebar SHALL offer a `Filter files` field. Typing SHALL show only the changed files whose path contains the typed text, ignoring case, in the tree, in the compact list and in the all-files sections, and the files header SHALL read `Files, <shown> of <n>`. Clearing the field SHALL show every file again.

#### Scenario: Filter by path

- **WHEN** the reviewer types `LIB/` into `Filter files` on the sample comparison
- **THEN** only `src/lib/money.ts` is listed and shown as a section, and the header reads `Files, 1 of 11`

#### Scenario: No file matches

- **WHEN** the typed text matches no changed file
- **THEN** the file list is empty and the diff area reads `No files match <text>.`

### Requirement: Compact mode

The `Compact` toggle SHALL switch the file list to a flat list of file names with tighter rows, show `✓` instead of `Reviewed`, and reflect its state with `aria-pressed`.

#### Scenario: Toggle compact

- **WHEN** the reviewer turns `Compact` on
- **THEN** folder rows disappear, every changed file appears once by its base name, and turning it off restores the tree with folder collapse state intact

### Requirement: File selection and sections

With no file selected the diff area SHALL show one section per changed file in tree order. Selecting a file SHALL show only that file, with the crumb `Changed file`, the path as heading, `renamed from <old path>` as subheading when renamed, and a `Back to all files` button that clears the selection.

#### Scenario: Focus and return

- **WHEN** the reviewer selects `src/lib/money.ts` and then presses `Back to all files`
- **THEN** the diff area first shows only that file's section and then shows every changed file again

### Requirement: Section header

Each section SHALL have a header with a fold caret, a language badge (`TS` for .ts/.tsx/.js/.jsx files, otherwise the upper-cased extension up to four characters), the file name in bold with its path muted, the `+a −r` counts, and a `Mark <path> reviewed` checkbox.

#### Scenario: Fold a section

- **WHEN** the reviewer activates a section's caret
- **THEN** its lines are hidden, the caret changes to `▸`, its accessible label switches between `Fold <path>` and `Unfold <path>`, and its reviewed state is unchanged

### Requirement: Side-by-side diff rendering

Each section SHALL render old and new sides in two columns with line numbers. Removed lines SHALL use a red background, added lines a green one, and the side missing a partner SHALL show a diagonal hatch. Consecutive removed and added runs SHALL pair line by line. In a paired line, when the changed middle (after stripping the common prefix and suffix) is under 70% of the longer line, that middle SHALL get a stronger highlight. Skipped context SHALL show as a full-width row reading `⋯ <n> unchanged lines`. Code SHALL be coloured with the artifact's token rules (keywords, strings, numbers, comments, literals, capitalised identifiers) and long lines SHALL scroll horizontally rather than wrap.

#### Scenario: Pairing and word highlight

- **WHEN** `import { toCents } from '../lib/money';` is replaced by `import { toMinorUnits } from '../lib/money';`
- **THEN** both appear on one row, red on the left and green on the right, with only the differing middle (`Cen` on the left, `MinorUni` on the right, after the shared prefix and suffix are removed) given the stronger highlight

#### Scenario: Mostly rewritten line

- **WHEN** `const cents = toCents(input.amount);` is replaced by `const minor = toMinorUnits(input.amount, currency);`
- **THEN** both appear on one row with the plain red and green backgrounds and no stronger highlight, because the change covers 70% or more of the longer line

#### Scenario: Unbalanced runs

- **WHEN** two lines are removed and three are added in one run
- **THEN** the third row shows the added line on the right and a hatched blank on the left

#### Scenario: Binary or oversized file

- **WHEN** a changed file is binary, or its diff exceeds the configured line limit
- **THEN** its section shows a notice instead of lines, and it can still be marked reviewed

### Requirement: Reviewed marks

Checking a section or tree checkbox SHALL mark that file reviewed everywhere it appears, and unchecking SHALL undo it. Marks SHALL belong to the current comparison (repository, base commit, head commit).

#### Scenario: Marks follow the comparison

- **WHEN** the reviewer marks files, switches to another comparison and back
- **THEN** the marks for the first comparison are restored, and the other comparison shows its own marks

#### Scenario: Marks survive a restart

- **WHEN** the reviewer marks files, restarts the app and reopens the same comparison
- **THEN** the same files are marked reviewed

### Requirement: Resizable sidebar

The handle between sidebar and main area SHALL resize the sidebar between 240 and 760 pixels by pointer drag, by Left/Right arrow keys in 24-pixel steps (80 with Shift), and SHALL reset to 360 pixels on double-click. While dragging, the handle SHALL show the accent colour.

#### Scenario: Keyboard resize clamps

- **WHEN** the handle has focus at 750 pixels and the reviewer presses Shift+Right
- **THEN** the sidebar is 760 pixels wide

### Requirement: Keyboard and assistive access

Every control SHALL be reachable by Tab and usable with Enter or Space. Toggles SHALL expose `aria-pressed`, collapsibles `aria-expanded`, and icon-only buttons an accessible name. Focus SHALL be visible.

#### Scenario: Keyboard-only review

- **WHEN** a reviewer uses only the keyboard
- **THEN** they can select a file, fold a section, mark it reviewed, resize the sidebar, and start an inline comment

### Requirement: Supported viewport

The workspace SHALL be usable at viewport widths of 1024 pixels and above without page-level horizontal scrolling. Narrower viewports are not supported in v1.

#### Scenario: Minimum width

- **WHEN** the viewport is 1024 pixels wide with the default sidebar
- **THEN** no page-level horizontal scrollbar appears, and diff sections scroll horizontally inside themselves
