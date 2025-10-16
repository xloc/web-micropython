# Bug Fix: Completion Improvements & Document Sync Race Condition

- **Date:** 2025-10-16
- **Symptom:** When typing quickly, completions after `.` showed stale suggestions; many items displayed wrong icons (generic "Reference"); snippets always appeared first; dunder methods (`__init__`) and private members (`_foo`) cluttered suggestion lists.
- **Root Cause:** Document changes weren't synced to LSP server on every keystroke (only on save/focus), causing race condition; only 5 of 25 CompletionItemKind types were mapped; snippets used `'0_snippet_'` prefix for artificial boost; no demotion of special members.
- **Solution:** Added automatic document sync on every keystroke via `onDidChangeContent` listener; expanded CompletionItemKind mapping to all 25 types; removed snippet prefix boost; created `enhanceSortText()` to demote dunders (category 11) and privates (category 10).

---

## Symptom

When typing code quickly, multiple completion issues appeared:

**Unstable suggestions:** After typing `machine.`, sometimes showed correct members (Pin, Timer), other times showed stale/incorrect suggestions. Completions didn't reflect current document state - LSP analyzed outdated code.

**Wrong icons:** Many completion items showed generic "Reference" icon instead of proper icons (Method, Class, Module, etc.), making it hard to identify symbol types at a glance.

**Snippet dominance:** Code snippets always appeared at the top of suggestion lists, pushing relevant LSP completions down. Typing `m` would show `main` snippet before `machine` module.

**Clutter:** Dunder methods (`__init__`, `__str__`, `__dict__`) and private members (`_internal_method`, `_helper`) appeared prominently in lists, obscuring public API members.

## Root Cause

**Race condition:** The completion provider called `lspClient.getCompletion()` immediately when `.` was typed, but document changes were only synced to LSP on explicit save/focus events, not on every keystroke. Timeline:
1. User types `machine`
2. User types `.`
3. Monaco triggers completion
4. LSP still has old document (without the `.`)
5. LSP returns stale suggestions

**Incomplete icon mapping:** `convertCompletionItemKind()` at `src/language-server/monacoIntegration.ts:311` only handled 5 cases (Constant=21, Variable=6, Function=3, Field=5, Keyword=14) with default fallback to Reference, so Methods (2), Classes (7), Modules (9) all showed wrong icon.

**Snippet artificial boost:** Snippets used `sortText: '0_snippet_' + String(idx).padStart(4, '0')` at `src/services/snippets.ts:62`, starting with `'0'` prefix that sorts before any letter, pushing them above all LSP suggestions.

**No special member demotion:** BasedPyright's sortText didn't differentiate between public API (`method`) and internal members (`__init__`, `_helper`), treating all equally.

## Investigation

**Observed behavior pattern:** Typed `machine.` quickly → saw stale completions. Typed slowly with pauses → saw correct completions. This timing dependency indicated a race condition.

**Traced completion flow:** Found `provideCompletionItems` called `getCompletion` immediately, but searched for when documents get synced to LSP. Found no automatic sync - only manual `openDocument` calls.

**Console inspection:** Noticed many completion items logging "kind: Reference" when they should be Methods/Classes. Checked `convertCompletionItemKind()` switch statement and found only 5 cases out of 25 possible LSP types.

**Snippet sort investigation:** Console showed snippets with `sortText: "0_snippet_0000"` while LSP items had sortText like `"02.0000.machine"`. The `'0'` prefix sorts before `'0-9'` digits, explaining why snippets always appeared first.

**BasedPyright sortText format research:** Discovered BasedPyright uses `"XX.YYYY.name"` format where XX is category (00=Keywords, 01=Auto-import, 02=Local, 09=Normal). Realized we could enhance UX by adjusting XX for dunders/privates.

## Solution

**Fix 1: Auto-sync on keystroke** at `src/language-server/monacoIntegration.ts:18-44`

Added `onDidChangeContent` listener for each Python model:

```typescript
monaco.editor.onDidCreateModel((model) => {
  const uri = model.uri.toString()
  if (model.getLanguageId() !== 'python') return

  const disposable = model.onDidChangeContent(() => {
    lspClient.changeDocument(uri, model.getValue()).catch((err) => {
      console.warn('[LSP] Failed to sync document change:', err)
    })
  })
  modelChangeDisposables.set(uri, disposable)
})
```

Why fire-and-forget (no await): Avoids blocking UI on network latency; LSP processes changes asynchronously; by time user triggers completion, sync completes. Tracked disposables in Map to prevent memory leaks when models are recreated during hot reload.

**Fix 2: Complete CompletionItemKind mapping** at `src/language-server/monacoIntegration.ts:378-434`

Expanded switch statement from 5 cases to all 25 LSP types (Text=1, Method=2, Function=3, ... TypeParameter=25). Changed default fallback from Reference to Text for unknown types.

**Fix 3: Intelligent sortText enhancement** at `src/language-server/monacoIntegration.ts:347-378`

Created `enhanceSortText()` function that preserves BasedPyright's `"XX.YYYY.name"` format but adjusts category XX:
- Dunder methods (`__init__`, `__str__`) → category 11 (demoted to bottom)
- Private members (`_foo`, `_bar`) → category 10 (demoted below public)
- Others → keep original category

Regex `/^\d{2}\./` detects BasedPyright format; fallback handles non-standard sortText.

**Fix 4: Remove snippet boost** at `src/services/snippets.ts:62`

Changed from `sortText: '0_snippet_' + String(idx).padStart(4, '0')` to `sortText: s.prefix`. Snippets now sort alphabetically by their prefix alongside LSP suggestions instead of always appearing first.

**Fix 5: Pass completion context** at `src/language-server/monacoIntegration.ts:203` and `LspClient.ts:354`

Added `context` parameter to `provideCompletionItems` and passed it to `lspClient.getCompletion()`. Extended `getCompletion()` signature to accept optional `monacoContext` and convert to LSP CompletionContext.

Note: This introduced an enum mismatch bug (direct cast without conversion) fixed in next commit - see `2025-10-16-completion-context-enum-mismatch.md`.

## Lessons Learned

- **Look for timing patterns in bugs**: "Works when slow, fails when fast" immediately suggests race condition between async operations
- **Sync aggressively for real-time features**: LSP completions need up-to-date document state; don't rely on save/focus events for sync
- **Fire-and-forget pattern for non-blocking updates**: Document sync doesn't need to block UI typing; eventual consistency is acceptable
- **Track disposables in Maps for lifecycle management**: Monaco can create multiple models per URI during hot reload; always dispose previous listeners to prevent memory leaks
- **Always implement full protocol support**: Partial enum mappings (5 of 25) cause subtle UX bugs; check specification for complete list
- **Preserve existing format when enhancing sortText**: BasedPyright's `"XX.YYYY.name"` format is intentional; adjust category number instead of replacing entirely
- **Don't artificially boost snippets**: Using `'0'` prefix violates principle that different providers should compete fairly in suggestion space
- **Web search for sortText format documentation**: BasedPyright's category numbering scheme isn't in official docs; found examples in GitHub issues

---

## References

- Monaco Editor API: [onDidChangeContent](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor.ITextModel.html#onDidChangeContent)
- LSP Specification: [DidChangeTextDocument](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_didChange)
- Monaco Editor API: [CompletionItemKind](https://microsoft.github.io/monaco-editor/typedoc/enums/languages.CompletionItemKind.html)
- Follow-up fix: [2025-10-16-completion-context-enum-mismatch.md](./2025-10-16-completion-context-enum-mismatch.md)
