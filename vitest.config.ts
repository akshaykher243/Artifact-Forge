import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/int/**/*.test.ts'],
    environment: 'node',
    // Integration tests build real repositories with many short Git processes.
    testTimeout: 20_000,
    // Hooks build Git fixtures (repositories, remotes, fetches); they are slow, not stuck.
    hookTimeout: 60_000,
    // Each test spawns many short Git processes, and endpoint security on this machine inspects
    // every launch; more parallel workers only queue them up and push tests past their timeouts.
    maxWorkers: 4,
  },
});
