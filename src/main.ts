import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { install as VueMonacoEditorPlugin } from '@guolao/vue-monaco-editor'
import './style.css'
import App from './App.vue'
import { initConfigWatcher } from './language-server/configWatcher'

const app = createApp(App)
app.use(createPinia())
app.use(VueMonacoEditorPlugin, {
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs'
  }
})
// Initialize watcher that reloads LSP on /sync-root/pyrightconfig.json save
initConfigWatcher()
app.mount('#app')
