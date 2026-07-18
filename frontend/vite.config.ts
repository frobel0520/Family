import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this repo at https://frobel0520.github.io/Family/,
  // so all asset URLs need this prefix. Update if the repo is renamed.
  base: '/Family/',
})
