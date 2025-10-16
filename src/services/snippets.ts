import type * as monaco from 'monaco-editor'
import { createVFS } from './vfs'

export type VSCodeSnippet = {
  prefix: string | string[]
  body: string | string[]
  description?: string
}

export type SnippetMap = Record<string, VSCodeSnippet>

export interface LoadedSnippets {
  items: Array<{
    name: string
    prefix: string
    body: string
    description?: string
  }>
  sourcePaths: string[]
}

// Default public snippet path (read-only)
const PUBLIC_SNIPPETS_DIR = '/snippets'

// Supported user snippet file paths (first existing wins)
const USER_SNIPPET_CANDIDATES = [
  '/sync-root/.vscode/python.code-snippets',
  '/sync-root/.vscode/python.json',
  '/sync-root/snippets/python.json',
]

export function parseSnippetJson(jsonText: string): SnippetMap {
  try {
    const data = JSON.parse(jsonText)
    if (data && typeof data === 'object') return data as SnippetMap
  } catch {
    // ignore invalid JSON
  }
  return {}
}

function normalizeBody(body: string | string[]): string {
  if (Array.isArray(body)) return body.join('\n')
  return body
}

function normalizePrefix(prefix: string | string[]): string[] {
  return Array.isArray(prefix) ? prefix : [prefix]
}

export function toMonacoCompletions(
  monacoNs: typeof monaco,
  snippets: LoadedSnippets
): monaco.languages.CompletionItem[] {
  return snippets.items.map((s) => ({
    label: s.prefix,
    kind: monacoNs.languages.CompletionItemKind.Snippet,
    detail: s.description ?? `Snippet: ${s.name}`,
    documentation: s.description,
    insertText: s.body,
    insertTextRules: monacoNs.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    sortText: s.prefix,
    range: undefined as any,
  }))
}

export async function loadPythonSnippets(userOpenFiles?: Record<string, string>): Promise<LoadedSnippets> {
  const result: LoadedSnippets = { items: [], sourcePaths: [] }
  const openMap = userOpenFiles ?? {}

  // Prefer loading public defaults via VFS, fallback to fetch
  let vfs: Awaited<ReturnType<typeof createVFS>> | null = null
  try {
    vfs = await createVFS()
  } catch {
    vfs = null
  }

  try {
    if (vfs) {
      // List all public snippet JSON files
      const entries = await vfs.readdir(PUBLIC_SNIPPETS_DIR)
      for (const e of entries) {
        if (e.type === 'file' && e.path.endsWith('.json')) {
          try {
            const text = await vfs.readFile(e.path)
            const map = parseSnippetJson(text)
            for (const [name, def] of Object.entries(map)) {
              const prefixes = normalizePrefix(def.prefix)
              const body = normalizeBody(def.body)
              for (const p of prefixes) {
                result.items.push({ name, prefix: p, body, description: def.description })
              }
            }
            result.sourcePaths.push(e.path)
          } catch {
            // ignore parse errors for this file
          }
        }
      }
    } else {
      // Fallback: fetch the main python.json
      const res = await fetch(PUBLIC_SNIPPETS_DIR + '/python.json')
      if (res.ok) {
        const text = await res.text()
        const map = parseSnippetJson(text)
        for (const [name, def] of Object.entries(map)) {
          const prefixes = normalizePrefix(def.prefix)
          const body = normalizeBody(def.body)
          for (const p of prefixes) {
            result.items.push({ name, prefix: p, body, description: def.description })
          }
        }
        result.sourcePaths.push(PUBLIC_SNIPPETS_DIR + '/python.json')
      }
    }
  } catch {
    // ignore errors
  }

  // Load user snippets from open files first (live edits)
  for (const candidate of USER_SNIPPET_CANDIDATES) {
    if (openMap[candidate] != null) {
      const map = parseSnippetJson(openMap[candidate])
      for (const [name, def] of Object.entries(map)) {
        const prefixes = normalizePrefix(def.prefix)
        const body = normalizeBody(def.body)
        for (const p of prefixes) {
          result.items.push({ name, prefix: p, body, description: def.description })
        }
      }
      result.sourcePaths.push(candidate)
    }
  }

  // Then check OPFS for user snippet files if not open
  if (vfs) {
    for (const candidate of USER_SNIPPET_CANDIDATES) {
      if (!(candidate in openMap)) {
        try {
          if (await vfs.exists(candidate)) {
            const text = await vfs.readFile(candidate)
            const map = parseSnippetJson(text)
            for (const [name, def] of Object.entries(map)) {
              const prefixes = normalizePrefix(def.prefix)
              const body = normalizeBody(def.body)
              for (const p of prefixes) {
                result.items.push({ name, prefix: p, body, description: def.description })
              }
            }
            result.sourcePaths.push(candidate)
          }
        } catch {
          // ignore read/parse errors for this candidate
        }
      }
    }
  }

  return result
}

export function registerPythonSnippetProvider(
  monacoNs: typeof monaco,
  loaded: LoadedSnippets
): monaco.IDisposable {
  return monacoNs.languages.registerCompletionItemProvider('python', {
    // Best practice: Snippets should NOT register '.' or '[' as trigger characters
    // These are "private" to language providers for member/index access contexts
    // where snippets don't make syntactic sense
    triggerCharacters: [' ', '\t', '(', '{'],
    provideCompletionItems: (model, position, context) => {
      // Suppress snippets in member access or indexing contexts
      // Even though we removed '.' and '[' from triggerCharacters, the provider
      // can still be invoked in these contexts (manual Ctrl+Space, etc.)
      if (context.triggerCharacter === '.' || context.triggerCharacter === '[') {
        return { suggestions: [] }
      }

      const suggestions = toMonacoCompletions(monacoNs, loaded)
      const word = model.getWordUntilPosition(position)
      const range = new monacoNs.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      for (const s of suggestions) {
        ;(s as any).range = range
        if (!s.filterText && typeof s.label === 'string') s.filterText = s.label
      }
      return { suggestions }
    },
  })
}

export const SNIPPET_USER_CANDIDATES = USER_SNIPPET_CANDIDATES
