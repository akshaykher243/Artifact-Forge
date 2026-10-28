---
description: Universal engineering principles (DRY, KISS, YAGNI, SOLID, naming, function shape, comments, testing)
alwaysApply: true
---

# Engineering Principles

Universal principles applied to all code. Cite them by name in reviews so the vocabulary travels (`DRY`, `SRP`, `YAGNI`). Every principle can be over-applied - if rigid application makes the code worse, the principle loses.

## DRY - Don't Repeat Yourself

One piece of knowledge, one place. Look for:

- Two functions whose bodies are 80%+ identical
- A constant, URL, threshold, or regex repeated in multiple files
- Parallel structures (`formatUser` / `formatAdmin` / `formatGuest`) that differ only by a field
- Validation logic repeated at every entry point instead of centralized
- Type duplication instead of `Partial<T>`, `Pick<T>`, or `Omit<T>`

**Not DRY violations:** code that *currently* looks the same but represents *different concepts* - they may evolve differently. Tolerate two copies; extract on the third.

## KISS - Keep It Simple

The simpler solution wins. Watch for clever one-liners that hide intent, generic abstractions with one caller, nested ternaries or `&&` / `||` chains that should be `if` statements, custom implementations of what the framework already provides, and `mode: string` flag parameters.

## YAGNI - You Aren't Gonna Need It

Speculative code is almost always wrong-shaped when the real need arrives. Drop parameters no caller passes, options nobody varies, interfaces with one implementation, "just in case" abstractions, and over-generalized utilities (`formatThing<T>` when `formatUser` suffices).

## SOLID

- **SRP - Single Responsibility.** One reason to change. A function that fetches AND validates AND persists is three functions. A component that fetches AND owns state AND renders is three concerns - extract a hook or split the component.
- **OCP - Open / Closed.** Giant `switch` blocks on type tags that grow with each new type are a smell. Prefer type-map dispatch or polymorphism.
- **LSP - Liskov Substitution.** Subtypes honor the parent contract. No `throw new NotSupportedError` to opt out of the base behavior.
- **ISP - Interface Segregation.** Small focused interfaces beat one fat one.
- **DIP - Dependency Inversion.** Business logic depends on abstractions, not concrete DB or HTTP libraries. Hooks and services depend on a typed client wrapper, not raw `fetch`.

## Naming

- Names reveal intent. `daysSinceLastLogin` not `d`. `hasValidSession` not `flag`.
- No disinformation. Don't call something `accountList` if it isn't a `List`. Don't call something `getX()` if it has side effects.
- No type encoding in names (`userArray`, `strName`) - the type system already says that.
- Classes and types are nouns. Functions and methods are verbs.
- One word per concept. Pick `fetch` / `retrieve` / `get` and stick with it.

## Function size and shape

- Small. If it does not fit on a screen, split it.
- One level of abstraction per function.
- Three parameters is the soft ceiling. More than that, group related args into a named record or struct, or split the function.
- **No flag parameters.** A `boolean` arg almost always means two functions.
- Side effects isolated, not buried.
- Return early. Guard clauses at the top, happy path at the bottom.

## Comments

- Comment **why**, not **what**. Code says what; comments justify the apparent oddity (constraint, alternative tried, bug link).
- No commented-out code. Git remembers.
- No journal comments (`// 2024-03-15 jsmith - added foo`). Git remembers.
- TODOs reference a ticket or are deleted.
- Do not narrate what the code does - identifiers do that. Do not reference the current task, fix, or callers - that belongs in the PR description.
- When a shortcut has a known ceiling - a global lock, an O(n) scan, a naive heuristic - name the ceiling and the condition that would trigger replacing it. That context makes the choice auditable and the future fix locatable.

## Testing

- Every exported function gets at least one unit test.
- Tests follow Arrange-Act-Assert structure.
- Mock all external dependencies - no real network or DB calls in unit tests.
- Test behavior, not implementation. Asserting on internal state ties the test to the structure rather than the contract.

## Also worth citing by name

Principle of Least Astonishment, Boy Scout Rule, Composition over inheritance, Law of Demeter, No premature optimization. Apply with judgment - architecturally significant decisions, inherently complex domains, and prototypes each get a different bar.
