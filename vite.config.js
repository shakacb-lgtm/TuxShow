import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './', // <--- This tells Vite to use relative local paths!
  plugins: [
    react(),
    tailwindcss(),
  ],
})
