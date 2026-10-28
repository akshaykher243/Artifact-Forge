# Spec Delta

## Purpose

The trust boundary between the browser UI and the local service that runs Git and the GitHub CLI: who may call it, which commands it may run, and what must never leave or be logged.

## ADDED Requirements

### Requirement: Loopback only, per-session token

The local service SHALL listen only on the loopback interface. Every request SHALL carry a random token generated at startup and handed to the UI in the URL the service prints, and requests with a missing or wrong token, a foreign `Origin`, or an unexpected `Host` SHALL be refused.

#### Scenario: Other site calls the service

- **WHEN** a page from another origin sends a request to the service's port
- **THEN** the service refuses it and runs no command

#### Scenario: DNS rebinding

- **WHEN** a request arrives with a `Host` header other than the loopback name and port
- **THEN** the service refuses it

### Requirement: Fixed operations, no browser-supplied commands

The service SHALL expose named operations only (open repository, list refs, compare, read file diff, fetch PR, read PR, auth status, submit review, check reviews). Each SHALL map to a fixed command and argument template. No request SHALL be able to supply a command, flag, Git config, environment variable or extra argument.

#### Scenario: Injected flag

- **WHEN** a ref value such as `--output=/tmp/x` or `-c core.pager=sh` is submitted
- **THEN** validation rejects it before any process starts

#### Scenario: Unknown operation

- **WHEN** a request names an operation outside the list
- **THEN** the service refuses it

### Requirement: Validate every input

Repository paths SHALL be absolute, resolved through symlinks, and inside a configured root. Refs SHALL satisfy Git's ref-name rules or be hexadecimal SHAs, and SHALL NOT start with `-`. File paths SHALL be among the comparison's changed files. PR numbers SHALL be positive whole numbers. Comment bodies SHALL be passed to `gh` only as request data on standard input.

#### Scenario: Path traversal

- **WHEN** a file path such as `../../etc/passwd` is requested
- **THEN** the service refuses it because it is not a changed file of the comparison

### Requirement: Safe process execution

Processes SHALL be started without a shell, with arguments as a list, `--` before any path arguments, a timeout, an output size cap, a closed standard input except for request data, terminal prompts disabled, and Git's external diff, text conversion and pager disabled.

#### Scenario: Repository-defined diff driver

- **WHEN** a repository configures an external diff or textconv driver for a changed file
- **THEN** the comparison runs without invoking that driver

#### Scenario: Hung process

- **WHEN** a Git or `gh` process exceeds its timeout
- **THEN** it is terminated and the request fails with a timeout message

### Requirement: No arbitrary file access

The service SHALL NOT read or serve files from disk other than its own UI assets and its own data folder. File contents SHALL come only from Git objects of the current comparison. The one exception is finding clones for a pull request link: the service MAY list folder names inside the configured roots (never outside them, never file contents) and read remotes through Git.

#### Scenario: Asset path escape

- **WHEN** a request asks for a UI asset path that resolves outside the asset folder
- **THEN** the service returns not found

### Requirement: Secrets never exposed

The app SHALL NOT read SSH private keys, `gh` tokens, or `.env` files, and SHALL NOT write tokens, key material, or full command environments to logs, the UI or error messages. Error text shown from Git or `gh` SHALL be passed through a filter that masks token-shaped strings.

#### Scenario: Token in error output

- **WHEN** a `gh` error message contains a string shaped like a GitHub token
- **THEN** the UI and logs show it masked

### Requirement: Nothing sent to AI services

Neither the UI nor the service SHALL send repository content, diffs or comments anywhere other than the confirmed `gh` submission, and the UI SHALL load no third-party scripts or fonts at runtime.

#### Scenario: Network audit

- **WHEN** a full review session runs with network logging
- **THEN** the only outbound connections are the Git SSH fetch to the selected remote and `gh` calls to the PR's GitHub host
