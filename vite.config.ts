/// <reference types="vitest" />
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    dts({ include: ['src'], rollupTypes: true })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: ['better-sqlite3']
    }
  },
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000, // 30s timeout for property tests
    hookTimeout: 10000,
    pool: 'forks', // Better isolation for fuzz tests
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  }
})
