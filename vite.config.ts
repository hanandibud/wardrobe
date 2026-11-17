import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative assets make the build portable to GitHub Pages project sites.
  base: './',
  server: {
    host: true,
  },
})
