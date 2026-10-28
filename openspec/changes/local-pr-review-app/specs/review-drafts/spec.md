# Spec Delta

## Purpose

Writing review feedback as local drafts: inline comments tied to diff lines, one overall comment, a pending list, and safe handling when the diff moves.

## ADDED Requirements

### Requirement: Inline comment on a line or range

The reviewer SHALL be able to start a comment on any added, removed or context line inside a diff hunk, or on a range of lines within one hunk on one side. The draft SHALL record the file path, side (old or new), start and end line, the head commit, and the text of the anchored lines.

#### Scenario: Single line

- **WHEN** the reviewer opens the comment box on new-side line 12 of `src/lib/money.ts`, types feedback and saves
- **THEN** the draft appears under that line and in the pending list as `src/lib/money.ts:12`

#### Scenario: Range

- **WHEN** the reviewer selects new-side lines 9 to 11 and saves a comment
- **THEN** the draft is tied to lines 9 to 11 and is shown after line 11

#### Scenario: Line range by dragging

- **WHEN** the reviewer presses `+` on new-side line 1 of `src/lib/money.ts` and drags to line 5, as on GitHub
- **THEN** lines 1 to 5 are highlighted while dragging, and on release the comment box opens for `src/lib/money.ts:1–5`; a drag never extends past its hunk or onto the other side

#### Scenario: Range across hunks refused

- **WHEN** a selected range crosses a `⋯ <n> unchanged lines` row or spans both sides
- **THEN** the app does not offer to comment and explains that a range must stay within one hunk on one side

#### Scenario: Empty text refused

- **WHEN** the reviewer tries to save a comment that is empty or only whitespace
- **THEN** saving is disabled

### Requirement: Overall review comment

The reviewer SHALL be able to write one overall comment for the comparison.

#### Scenario: Overall only

- **WHEN** the reviewer writes an overall comment and no inline comments
- **THEN** the pending review lists the overall comment and counts zero inline comments

### Requirement: Edit and delete unsent drafts

Unsent drafts SHALL be editable and deletable. Deleting SHALL ask for confirmation. Submitted comments SHALL NOT be editable in the app.

#### Scenario: Edit

- **WHEN** the reviewer edits a draft and saves
- **THEN** the new text replaces the old text everywhere it is shown

#### Scenario: Delete

- **WHEN** the reviewer deletes a draft and confirms
- **THEN** it disappears from the diff and the pending list

### Requirement: Pending review list

The app SHALL show a pending review listing the overall comment and every inline draft (path, line or range, first line of text, and state: `Draft`, `Outdated` or `Submitted`), with counts. Selecting an entry SHALL scroll to and highlight its diff location, opening the file and unfolding its section if needed.

#### Scenario: Jump to location

- **WHEN** the reviewer selects a draft for a file whose section is folded
- **THEN** the section unfolds, the anchored line scrolls into view and is highlighted

#### Scenario: Next and previous

- **WHEN** the reviewer uses next and previous comment navigation
- **THEN** focus moves through the drafts in file and line order

### Requirement: Local persistence

Drafts SHALL be saved on this machine as the reviewer types, keyed by repository and PR number (or by base and head when no PR is set), and SHALL survive a page reload and an app restart. They SHALL never be written into the repository.

#### Scenario: Survives restart

- **WHEN** the app is restarted and the same repository and PR are opened
- **THEN** all unsent drafts reappear in place

#### Scenario: Storage failure

- **WHEN** a draft cannot be saved
- **THEN** the app shows `Draft not saved` beside it and keeps the text in the box

### Requirement: Local and submitted are clearly different

Draft comments SHALL be labelled `Draft` and styled differently from submitted ones, and the app SHALL never show a comment as submitted unless the submission reported success.

#### Scenario: Labelling

- **WHEN** the pending review holds one draft and one submitted comment
- **THEN** each shows its own label and style

### Requirement: Outdated drafts

When the head commit of the comparison changes, each inline draft SHALL be checked again. A draft whose anchored lines still exist with identical text at the same position in the new diff SHALL move to the new head. Any other draft SHALL be marked `Outdated`, keep its text, and be excluded from submission until the reviewer re-anchors it to a line or deletes it.

#### Scenario: Unchanged line

- **WHEN** a new commit touches only other files
- **THEN** drafts on this file stay `Draft` and point at the new head

#### Scenario: Moved or changed line

- **WHEN** a new commit changes the anchored line's text
- **THEN** the draft becomes `Outdated` and the submit summary says how many drafts are excluded
