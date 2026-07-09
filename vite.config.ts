import { defineConfig } from 'vite'

// This is a GitHub Pages *project* site, served under https://<user>.github.io/rollem/,
// so every asset URL must be prefixed with /rollem/. Without this base the built
// index.html requests /assets/... from the domain root and Pages returns 404.
// Local dev (`npm run dev`) and `npm run preview` honor the same base transparently.
export default defineConfig({
  base: '/rollem/',
})
