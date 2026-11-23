import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'supabase/tests/**/*.test.ts'],
    pool: 'forks',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
