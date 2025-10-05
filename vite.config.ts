import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Use relative base for GitHub Pages subpath deployments
  // Keeps dev behavior unchanged, while production uses './' so assets load under /<repo>/
  base: command === 'build' ? './' : '/',
  plugins: [vue(), tailwindcss()],
  worker: { format: 'es' },
  optimizeDeps: {
    exclude: ['pyodide']
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
}))
