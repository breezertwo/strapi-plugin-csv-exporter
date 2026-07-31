import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/src/**/*.test.ts'],
    coverage: {
      include: ['server/src/**/*.ts'],
      exclude: ['server/src/**/*.test.ts'],
    },
  },
});
