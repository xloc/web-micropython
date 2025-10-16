# Bug Fix: Completion Context Enum Mismatch & Snippet Filtering

- **Date:** 2025-10-16
- **Symptom:** After typing `machine.`, builtin functions (`pow`, `abs`, `len`) and dunders (`__name__`, `__loader__`) incorrectly appeared in autocomplete, and snippets like `ifmain` showed up in member access contexts.
- **Root Cause:** Monaco Editor uses 0-based enum values (TriggerCharacter=1) while LSP uses 1-based (Invoked=1); direct cast without conversion caused BasedPyright to interpret trigger character events as manual invocation.
- **Solution:** Created explicit enum conversion function using switch statement to map Monaco (0,1,2) → LSP (1,2,3), and removed `.` and `[` from snippet trigger characters per VSCode best practice.

---

## Symptom

When typing `machine.` (dot after a module name), the autocomplete list incorrectly included:
- Builtin functions like `pow`, `abs`, `len` (not valid after dot operator)
- Module dunder attributes like `__name__`, `__loader__`, `__package__` (internal implementation details)
- Code snippets like `ifmain` (statement-level constructs, syntactically invalid in member access)
- Total of 52 items instead of just legitimate module members (Pin, Timer, etc.)

Similar incorrect behavior occurred when typing `array[` for indexing contexts.

## Root Cause

Two independent issues:

**Enum mismatch:** Monaco Editor's `CompletionTriggerKind` uses 0-based indexing (Invoke=0, TriggerCharacter=1, Incomplete=2) while LSP protocol uses 1-based indexing (Invoked=1, TriggerCharacter=2, Incomplete=3). The code at `src/language-server/LspClient.ts:361` performed a direct cast without conversion:

```typescript
triggerKind: monacoContext.triggerKind as CompletionTriggerKind,
// Monaco's 1 (TriggerCharacter) → sent as 1 → LSP interprets as Invoked ❌
```

Result: When user typed `.`, Monaco sent `triggerKind: 1` (meaning TriggerCharacter), but BasedPyright received `1` (meaning Invoked/manual Ctrl+Space), so it returned all symbols in scope instead of only members.

**Snippet trigger characters:** The snippet provider registered `.` and `[` as trigger characters (`src/services/snippets.ts:168`), violating VSCode best practice that these characters should be "private" to language providers for member/index access contexts.

## Investigation

**Console log analysis** revealed the smoking gun:
```json
{
  "context": {
    "triggerKind": 1,
    "triggerCharacter": "."  // ← Contradiction!
  }
}
```

The request had both `triggerCharacter: "."` (indicating dot was typed) AND `triggerKind: 1` (indicating manual invocation). This contradiction was impossible if enums were mapped correctly.

**Web research** on Monaco Editor and LSP specifications revealed the off-by-one difference:
- Monaco: [CompletionContext](https://microsoft.github.io/monaco-editor/typedoc/interfaces/languages.CompletionContext.html) uses 0-based enum
- LSP: [CompletionTriggerKind](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/) uses 1-based enum

**Verification:** Checked other enum conversions (CompletionItemKind, DiagnosticSeverity) to ensure no similar bugs existed. Found CompletionItemKind values are identical in both (1-25), and DiagnosticSeverity was already properly converted via `convertSeverity()` function.

## Solution

**Fix 1: Explicit enum conversion function** at `src/language-server/LspClient.ts:354-369`:

```typescript
private convertMonacoTriggerKindToLsp(monacoTriggerKind: number): CompletionTriggerKind {
  // CRITICAL: Monaco uses 0-based enum values, LSP uses 1-based
  switch (monacoTriggerKind) {
    case 0: return 1; // Monaco.Invoke → LSP.Invoked(1)
    case 1: return 2; // Monaco.TriggerCharacter → LSP.TriggerCharacter(2)
    case 2: return 3; // Monaco.TriggerForIncompleteCompletions → LSP.TriggerForIncompleteCompletions(3)
    default:
      console.warn(`[LSP] Unknown Monaco triggerKind: ${monacoTriggerKind}, defaulting to Invoked`);
      return 1;
  }
}
```

Why switch statement instead of `+1` arithmetic: Makes the mapping explicit and self-documenting, easier to understand the correspondence between Monaco and LSP values.

**Fix 2: Snippet trigger character filtering** at `src/services/snippets.ts:171-178`:

Removed `.` and `[` from `triggerCharacters` array (VSCode best practice: these are "private" to language providers). Added defense-in-depth check:

```typescript
provideCompletionItems: (model, position, context) => {
  if (context.triggerCharacter === '.' || context.triggerCharacter === '[') {
    return { suggestions: [] }
  }
  // ...
}
```

Even if snippet provider is somehow invoked during member/index access (e.g., manual Ctrl+Space), explicitly suppress suggestions.

## Lessons Learned

- **Don't trust enum casts across API boundaries**: TypeScript doesn't warn when casting number types, but underlying values may differ between systems
- **Look for contradictions in debug output**: The combination of `triggerKind: 1` + `triggerCharacter: "."` was logically impossible and revealed the enum mismatch
- **Use web search for protocol specifications**: Comparing Monaco Editor docs vs LSP spec side-by-side exposed the 0-based vs 1-based indexing difference
- **Explicit conversion beats arithmetic**: Using switch statement instead of `+1` makes enum mapping obvious and maintainable
- **Follow platform best practices**: VSCode's design decisions (like "private" trigger characters) exist for good UX reasons and should be respected
- **Defense in depth for edge cases**: Both removing trigger characters AND runtime checking provides robust protection against unexpected invocations
- **Audit similar patterns**: After finding one enum mismatch, check all other enum conversions in the codebase

---

## References

- LSP Specification: [CompletionTriggerKind](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)
- Monaco Editor API: [CompletionContext](https://microsoft.github.io/monaco-editor/typedoc/interfaces/languages.CompletionContext.html)
- VSCode Issue: [Snippets don't show up after trigger characters #22205](https://github.com/microsoft/vscode/issues/22205)
