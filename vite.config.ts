import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/mix-song-app/' : '/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/audio/**/*.test.ts'],
  },
})
