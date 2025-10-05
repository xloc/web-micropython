# MicroPython Web IDE

A Vue 3 + TypeScript web IDE for MicroPython development with Web Serial API integration.

## Architecture Decisions

### UI Layout
- Monaco Editor spanning almost entire viewport
- VSCode-like tab bar with run/upload buttons
- Split panel system (vertical or horizontal)
  - Left/Top: Monaco Editor
  - Right/Bottom: Serial Console
  - Resizable panels with drag handles
  - Layout preferences persisted to localStorage

### Component Architecture
- **App.vue** - Main application shell
- **EditorPanel.vue** - Monaco editor container
- **ConsolePanel.vue** - Web Serial terminal interface
- **TabBar.vue** - File tab + action buttons
- **SplitPane.vue** - Resizable panel system

### Technology Stack
- **Monaco Editor**: `@guolao/vue-monaco-editor` (by imguolao)
  - Built-in keyboard shortcuts (no custom implementation needed)
  - MicroPython syntax highlighting
- **Terminal**: `xterm.js` with addons
  - `xterm-addon-fit` for auto-resizing
  - Canvas/WebGL rendering for performance
- **State Management**: Pinia stores
  - `stores/editor.ts` - Monaco editor state & content
  - `stores/serial.ts` - Web Serial communication & device state
  - `stores/ui.ts` - Layout preferences & panel sizes

### Serial Communication
- **Unified Serial Store**: All Web Serial operations centralized in Pinia store
  - Connection management
  - Raw REPL mode handling for code uploads
  - User input control (disabled during uploads)
  - Reactive state for UI components
- **MicroPython Modes**:
  - Normal REPL: Interactive user input enabled
  - Raw REPL: User input disabled, upload mode active
    - Enter: `Ctrl+A` (`\x01`)
    - Exit: `Ctrl+D` (`\x04`)

### File Structure
```
src/
├── components/
│   ├── EditorPanel.vue
│   ├── ConsolePanel.vue  
│   ├── TabBar.vue
│   └── SplitPane.vue
├── composables/
│   ├── useEditor.ts
│   ├── useSerial.ts
│   └── useSplitPane.ts
├── stores/
│   ├── editor.ts
│   ├── serial.ts
│   └── ui.ts
└── types/
    └── index.ts
```

## Packages

### Core Framework
- vue3: https://vuejs.org/guide/introduction.html
- tailwindcss: https://tailwindcss.com/docs/aspect-ratio
- pinia: https://pinia.vuejs.org/cookbook/
- @vueuse/core: https://vueuse.org/functions.html
- @heroicons/vue: https://heroicons.com

### Additional Dependencies
- `@guolao/vue-monaco-editor` - Monaco Editor for Vue 3
- `xterm` - Terminal emulator
- `xterm-addon-fit` - Auto-resize addon
- `@types/w3c-web-serial` - Web Serial API TypeScript types

## Deploy to GitHub Pages

This project is configured to deploy to GitHub Pages under a repository subpath, e.g. `https://<user>.github.io/<project>/`.

- Vite build uses a relative base so all assets load correctly from a subpath.
- Monaco Editor and the Python LSP (BasedPyright) are loaded from CDNs, so they are not affected by the site origin or subpath.

How to deploy:
- Enable Pages in repository settings (Settings → Pages → Source: GitHub Actions).
- Push to `main` or run the workflow manually. The workflow `.github/workflows/deploy.yml` builds the site and publishes `dist/` to Pages.
