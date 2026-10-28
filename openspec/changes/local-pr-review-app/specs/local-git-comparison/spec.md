# Spec Delta

## Purpose

Opening a local repository and comparing two commits with local Git, including fetching a PR's commits over SSH, without changing the repository's branches or working tree.

## ADDED Requirements

### Requirement: Open a repository inside a configured root

The app SHALL accept an absolute path to a local Git working tree only if its resolved real path is inside a configured root folder and is the top level of a Git working tree. It SHALL list recently opened repositories.

#### Scenario: Valid repository

- **WHEN** the reviewer enters the path of a clone inside a configured root
- **THEN** the repository opens and its remotes and branches are listed

#### Scenario: Outside the roots

- **WHEN** the path resolves (after following symlinks) outside every configured root
- **THEN** the app refuses with a message naming the configured roots, and no Git command runs against that path

#### Scenario: Not a repository

- **WHEN** the path exists but is not the top level of a Git working tree
- **THEN** the app reports `Not a Git repository` and nothing else is shown

#### Scenario: Missing path

- **WHEN** the path does not exist
- **THEN** the app reports that the path was not found

### Requirement: Open a pull request from its link

The repository field SHALL also accept a GitHub pull request link (`https://github.com/<owner>/<repo>/pull/<number>`, with or without a trailing path, query or fragment). The app SHALL then look for local clones of that repository, first among recently opened repositories and then inside the configured roots, and match a clone when one of its remotes points at the same GitHub repository (owner and name compared without regard to case), preferring an SSH remote. The search SHALL list folder names only, SHALL skip hidden folders, `node_modules` and build output, and SHALL stop at a fixed depth and folder count.

#### Scenario: Link to a cloned repository

- **WHEN** the reviewer enters `https://github.com/acme/platform/pull/42/files` and exactly one clone inside a root has a remote for `acme/platform`
- **THEN** that clone opens and the review of pull request #42 starts through that remote, as if its number had been entered under `Pull request`

#### Scenario: Several clones

- **WHEN** more than one clone has a remote for the linked repository
- **THEN** the app lists them by path and opens the one the reviewer picks, then starts the review

#### Scenario: No clone

- **WHEN** no clone inside the roots has a remote for the linked repository
- **THEN** the app reports `No local clone of <owner>/<repo> was found inside <roots>.` and suggests cloning it over SSH or opening it by path

#### Scenario: Not a pull request link

- **WHEN** the reviewer enters a GitHub link that is not a pull request (for example a repository or an issue)
- **THEN** the app explains that it needs a pull request link or a folder path, and searches nothing

### Requirement: Choose base and head

The reviewer SHALL be able to choose a base and a head from local branches, remote-tracking branches, tags, or a full or abbreviated commit SHA. Each choice SHALL resolve to one commit, shown as a short SHA.

#### Scenario: Unknown ref

- **WHEN** the reviewer enters a ref that does not resolve to a commit
- **THEN** the app reports `Unknown ref: <ref>` and keeps the previous comparison

#### Scenario: Ambiguous abbreviated SHA

- **WHEN** an abbreviated SHA matches more than one object
- **THEN** the app asks for a longer SHA and does not compare

### Requirement: Compare as a pull request does

The comparison SHALL show the changes on head since its merge base with base (three-dot semantics), with rename detection and three lines of context, matching the diff GitHub shows for a PR between the same commits.

#### Scenario: Base moved on

- **WHEN** base has commits that head does not
- **THEN** those commits' changes do not appear in the comparison

#### Scenario: No common history

- **WHEN** base and head share no merge base
- **THEN** the app reports that the refs have no common history and shows no diff

#### Scenario: Identical commits

- **WHEN** head contains no changes beyond the merge base
- **THEN** the workspace shows its empty state

### Requirement: Fetch a PR's commits over SSH on request

For a GitHub remote, the reviewer SHALL be able to fetch a PR's head and base commits by PR number through that remote's SSH URL. The fetch SHALL run only when the reviewer starts it, SHALL write no branch, tag or other ref, and SHALL report success or the Git error.

#### Scenario: Fetch succeeds

- **WHEN** the reviewer asks to fetch PR 42 from `origin`
- **THEN** the PR's head and base commits are available locally, the comparison uses them, and `git branch -a` and `git status` are unchanged

#### Scenario: SSH authentication fails

- **WHEN** the SSH key is not loaded or not authorised
- **THEN** the app reports that SSH authentication failed and suggests loading the key into the SSH agent, without prompting for a passphrase

#### Scenario: PR ref missing

- **WHEN** the remote has no `refs/pull/<n>/head`
- **THEN** the app reports that the PR was not found on that remote

#### Scenario: Remote is not SSH

- **WHEN** the selected remote uses an HTTPS URL
- **THEN** the app explains that PR fetching needs an SSH remote and does not fetch

### Requirement: Changed-file list and stats

For a comparison the app SHALL list every changed file with status (added, modified, deleted, renamed with its old path, binary) and added and removed line counts, and SHALL return each file's diff lines with old and new line numbers.

#### Scenario: Matches Git

- **WHEN** a fixture repository is compared
- **THEN** file paths, statuses and counts equal those of `git diff --numstat -M` and `--name-status -M` for the same merge base and head

#### Scenario: Large comparison

- **WHEN** a comparison has more than 1,000 changed files or one file exceeds the line limit
- **THEN** the file list still loads, and oversized files show a notice instead of lines

### Requirement: Read-only repository access

Reviewing SHALL NOT change the working tree, the index, branches, tags, remote-tracking refs, configuration or stashes. The only permitted repository writes are Git objects and housekeeping a fetch creates.

#### Scenario: Repository unchanged

- **WHEN** a full review session runs (open, fetch, compare, comment, submit)
- **THEN** a snapshot of refs, `git status --porcelain` and `.git/config` taken before and after is identical
