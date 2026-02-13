import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    watch: false,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/fuzz/**',
      '.stryker-tmp/**',
      '**/tests/14-public-api.test.ts',
      '**/tests/16-integration.test.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 10000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})
