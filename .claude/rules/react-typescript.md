---
description: React and TypeScript component rules (functional components, hooks, props, testing)
globs: ["**/*.tsx","**/*.ts"]
alwaysApply: false
---

# React + TypeScript Rules

## Components
- Functional components only - never class components
- Components must have a single responsibility - extract when JSX exceeds 100 lines
- Never nest ternary expressions inside JSX - extract to a variable, early return, or render helper before the return statement.
- Never use React.FC - type props explicitly and declare return type as JSX.Element
- All props must be typed with a named interface defined above the component
- Never use inline type literals for props that are used in more than one place

## Props and State
- No prop drilling beyond 2 levels - use React Context or a state manager
- Prefer controlled components over uncontrolled for form elements
- Never mutate state directly - always use the setter function
- Keep derived state out of useState - compute from existing state instead

## Hooks
- Custom hooks must start with `use` prefix
- All useEffect dependencies must be explicit and complete
- Empty dependency array [] is only acceptable with an explanatory comment
- Never create hooks inside conditions or loops

## Styling
- Follow the styling approach declared in `AGENTS.md` (Tailwind, CSS modules, styled-components, etc.). Do not mix approaches in one project.
- No inline style objects unless the value is dynamic (e.g. computed positioning); static styling goes through the project's chosen system.
- Never use `!important`.

## Performance
- Wrap expensive computations in useMemo
- Wrap callback props passed to child components in useCallback
- Use React.lazy and Suspense for route-level code splitting
- Never import entire icon libraries - import individual icons only

## Error Handling
- Wrap async operations in try/catch - never let unhandled rejections propagate from event handlers or `useEffect`.
- Use error boundaries to isolate component subtree failures. One global boundary is not enough - scope them to meaningful UI regions.
- Never display raw error objects or stack traces to the user. Map to a user-facing message.
- Async data-fetch errors set error state; they don't throw into the render tree.

## Testing
- Test behaviour, not implementation - never assert on internal state or rendered class names.
- Use the test library declared in `AGENTS.md` (React Testing Library, Enzyme, Vitest with testing-library, etc.). Do not introduce a second library.
- Every component requires a render test and at least one interaction test.
