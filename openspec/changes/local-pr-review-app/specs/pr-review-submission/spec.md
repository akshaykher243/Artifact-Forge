# Spec Delta

## Purpose

Identifying the GitHub PR a review targets and posting the pending review to it as a Comment review through the GitHub CLI, only after explicit confirmation, reporting exactly what happened.

## ADDED Requirements

### Requirement: GitHub CLI readiness

The app SHALL check that `gh` is installed and signed in to the PR's host, and SHALL show the signed-in account name. It SHALL never read, show, store or log the `gh` token.

#### Scenario: Not installed

- **WHEN** `gh` is not on the path
- **THEN** submission is unavailable and the app says the GitHub CLI is required to post reviews, while diff review and drafts keep working

#### Scenario: Not signed in

- **WHEN** `gh` has no account for the host
- **THEN** the app tells the reviewer to run `gh auth login` in a terminal, and offers no sign-in of its own

### Requirement: Identify the target PR

The reviewer SHALL identify a PR by number. The owner and repository SHALL come from the selected remote's GitHub URL. The app SHALL read the PR's number, title, state, base and head branch names, head commit and URL through `gh`, and SHALL show them.

#### Scenario: Valid PR

- **WHEN** the reviewer enters 42 for a repository whose `origin` is `git@github.com:acme/platform.git`
- **THEN** the app shows `acme/platform #42`, its title, state, branches and short head commit

#### Scenario: Invalid number

- **WHEN** the reviewer enters anything other than a positive whole number
- **THEN** the app rejects it without calling `gh`

#### Scenario: Not found or no access

- **WHEN** `gh` reports that the PR does not exist or cannot be accessed
- **THEN** the app shows `gh`'s message and submission stays unavailable

#### Scenario: Closed or merged PR

- **WHEN** the PR is closed or merged
- **THEN** the app shows that state and asks for extra confirmation before allowing submission

### Requirement: Comparison must match the PR

Submission SHALL be allowed only when the comparison's head commit equals the PR's current head commit as reported by `gh` at confirmation time.

#### Scenario: PR moved on

- **WHEN** someone pushed to the PR after the comparison was loaded
- **THEN** the app blocks submission, says the PR has new commits, and offers to fetch them and refresh the comparison (which re-checks drafts as specified for outdated drafts)

### Requirement: Explicit confirmation

Pressing submit SHALL open a confirmation that shows the repository, PR number and title, base and head branches, short head commit, the action `Comment`, the signed-in account, the number of inline comments and whether there is an overall comment, plus the count of outdated drafts left out. Nothing SHALL be sent until the reviewer confirms. Cancelling SHALL send nothing and keep every draft.

#### Scenario: Cancel

- **WHEN** the reviewer cancels the confirmation
- **THEN** no `gh` command runs and every draft is unchanged

#### Scenario: Nothing to send

- **WHEN** there is no overall comment and no submittable inline draft
- **THEN** submit is disabled

### Requirement: Submit as one Comment review

On confirmation the app SHALL post one review with the action Comment, holding the overall comment and every submittable inline comment, tied to the confirmed head commit, in a single request through the allowlisted `gh` command. It SHALL NOT approve or request changes.

#### Scenario: Success

- **WHEN** `gh` exits successfully and returns the created review
- **THEN** the app marks the included drafts `Submitted`, shows a link to the review, and keeps outdated drafts as drafts

#### Scenario: Rejected by GitHub

- **WHEN** `gh` exits with an error that GitHub refused the request (for example a line outside the diff, missing permission, or an existing pending review)
- **THEN** the app shows `gh`'s message, marks nothing as submitted, and keeps every draft

### Requirement: No duplicate submissions

While a submission is running the submit control SHALL be disabled. When the outcome is unknown (for example `gh` timed out or the connection dropped), the app SHALL NOT retry automatically and SHALL mark the review `Outcome unknown`. Before allowing another attempt it SHALL offer to check the PR's reviews through `gh` for one by the signed-in account submitted after the attempt began.

#### Scenario: Double click

- **WHEN** the reviewer confirms twice in quick succession
- **THEN** exactly one `gh` submission runs

#### Scenario: Timeout then check

- **WHEN** a submission times out and the reviewer runs the check, which finds a matching review
- **THEN** the app marks the drafts `Submitted` and links to that review without sending again

### Requirement: Honest result reporting

The app SHALL only report success when `gh` exits with status 0 and returns a review identifier, and SHALL show the review URL taken from that response.

#### Scenario: Unexpected output

- **WHEN** `gh` exits with status 0 but its output cannot be parsed
- **THEN** the app marks the outcome unknown rather than successful
