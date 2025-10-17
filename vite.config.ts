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
          if (!id.includes('node_modules')) return

          if (id.includes('monaco-editor')) {
            if (id.includes('/vs/editor/standalone/')) return 'monaco-standalone'
            if (id.includes('/vs/platform/')) return 'monaco-platform'
            if (id.includes('/vs/base/')) return 'monaco-base'
            return 'monaco-core'
          }

          if (id.includes('@guolao/vue-monaco-editor')) return 'monaco-adapter'
          if (id.includes('@xterm')) return 'xterm'
          if (id.includes('vscode-jsonrpc') || id.includes('vscode-languageserver')) return 'vscode-lsp'
          return 'vendor'
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
