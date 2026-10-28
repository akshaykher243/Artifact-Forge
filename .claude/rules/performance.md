---
description: Universal performance rules (N+1 / batching, blocking on hot paths, unbounded data loads, redundant work in loops, allocation in hot paths)
alwaysApply: true
---

# Performance

Stack-agnostic performance rules. Flag only work on a hot path - a request handler, render, loop, or anything that scales with input or traffic. Cost off the hot path is not a finding, and micro-optimization that does not change the observable cost class is noise. Stack-specific performance (React re-renders, bundle size, framework data loading) lives in the stack rule files.

## Data access

- No query inside a loop over rows. One round trip per iteration (N+1) collapses under load - batch into a single query: a join, or one fetch keyed by the collected IDs.
- Fetch related data in one round trip, not one per parent. The parent count is the request multiplier.
- Filter, sort, and paginate in the data store, not in application code after loading everything.

## Hot-path blocking

- No synchronous I/O (file, network, crypto, subprocess) on a request or render path - it stalls the worker for every concurrent caller.
- No independent blocking calls run one after another inside a loop - the latency sums. Issue them concurrently and wait for all results together.
- No unbounded concurrency fanned out from a list of unknown size - cap it, or one large input exhausts connections or memory.

## Unbounded data

- Do not load or return an entire collection when the caller needs a page or a count. Unbounded result sets grow with the table.
- Select only the columns or fields used. Returning whole rows ships data the caller discards.
- Stream or chunk large payloads instead of buffering the whole thing in memory.

## Redundant work

- Hoist work that does not change with the iteration out of the loop - repeated lookups, recompiled regexes, re-fetched config.
- Compute a value once and reuse it, rather than recomputing it per call on a hot path.
- Do not rebuild the same derived structure (map, index, sorted copy) on every invocation when the source is stable.

## Allocation on hot paths

- Avoid per-iteration allocation in tight loops when one reused buffer or accumulator does the job.
- Do not copy a large structure to make a small change on a hot path - mutate in place or restructure so the copy is unnecessary.
