import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    watch: false,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/fuzz/**',
    ],
  },
})
