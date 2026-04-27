import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['dist/**', 'server-dist/**', 'node_modules/**'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
})
