Milestone 3 complete: extracted sync to its own store and updated UI.

What changed

- New store: src/stores/sync.ts
    - State: filters, plan, progress, status, result. Derived: isSyncing.
    - Actions: computePlan(), syncProject(), cancel().
    - Computes a simple plan over /sync-root and orchestrates sync via
serial.sendText with raw REPL (Ctrl+A/Ctrl+D). Pauses console input during sync.
- Updated components
    - src/components/FileExplorer.vue
        - Sync button disabled when syncStore.isSyncing.
        - Calls syncStore.syncProject() instead of serialStore.syncProject(...).
    - src/components/ConsolePanel.vue
        - Progress overlay now reads from syncStore.progress (operation, current/
total, currentPath).
- Temporary behavior
    - Serial store’s upload flow still uses its own progress (for run/upload
buttons). Project sync now uses the sync store.

How to test

- Start app and connect device.
- Open/modify a few files under /sync-root.
- Click “Sync to Device” in Explorer:
    - Console overlay shows operation and progress bar.
    - Explorer button is disabled during sync; re-enabled after completion.
    - Console input is paused during sync (typing shouldn’t send to device), and
resumes afterward.
- Optional checks:
    - Large projects still compute quickly (plan shows many dirs/files).
    - After sync, open a file on device manually to confirm content updated.

Ready for Milestone 4 (Serial store shell/session API). Proceed?