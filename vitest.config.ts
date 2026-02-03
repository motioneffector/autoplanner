import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Use the fuzz setup file to configure fast-check globally
    setupFiles: ['./tests/fuzz/setup.ts'],
    // Disable watch mode by default for CI
    watch: false,
  },
})
