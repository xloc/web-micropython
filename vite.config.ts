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
  build: {
    // Reduce chunk size warnings by splitting heavy libs and relaxing the threshold
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('monaco-editor') || id.includes('@guolao/vue-monaco-editor')) return 'monaco'
            if (id.includes('@xterm')) return 'xterm'
            if (id.includes('vscode-jsonrpc') || id.includes('vscode-languageserver')) return 'vscode-lsp'
            return 'vendor'
          }
        }
      }
    }
  },
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
