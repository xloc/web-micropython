import type * as monaco from 'monaco-editor'
import type { Diagnostic, DiagnosticSeverity, CompletionItem, CompletionList, MarkupContent, Location, LocationLink } from 'vscode-languageserver-types'
import { LspClient, fromUri } from './LspClient'
import { fromRange, toInlayHint, toRange, toSemanticTokens } from 'monaco-languageserver-types'
import { createVFS } from '../services/vfs'
import { loadMicropythonStubs } from './micropythonStubs'

let registered = false

export function registerMonacoProviders(monaco: typeof import('monaco-editor'), lspClient: LspClient) {
  if (registered) return
  registered = true

  // Lazily-initialized helpers for fetching file content for target URIs
  let vfsPromise: Promise<Awaited<ReturnType<typeof createVFS>>> | null = null
  let stubFilesPromise: Promise<Record<string, string>> | null = null

  const ensureModelForUri = async (uriStr: string) => {
    const uri = monaco.Uri.parse(uriStr)
    let model = monaco.editor.getModel(uri)
    if (model) return

    // Try to load content from VFS or stub bundle
    const path = fromUri(uriStr)
    let text: string | null = null
    if (path.startsWith('/sync-root/')) {
      try {
        if (!vfsPromise) vfsPromise = createVFS()
        const vfs = await vfsPromise
        text = await vfs.readFile(path)
      } catch {
        text = ''
      }
    } else if (path.startsWith('/typeshed/')) {
      // Typeshed stdlib files are bundled inside the Pyright worker but not accessible from the UI thread
      // Show a placeholder message for Python stdlib modules
      text = `# Python standard library stubs are not available in this environment.
#
# This is a placeholder for: ${path}
#
# To see documentation, visit: https://docs.python.org/3/library/
`
    } else if (path.startsWith('/typings/')) {
      try {
        if (!stubFilesPromise) stubFilesPromise = loadMicropythonStubs()
        const stubs = await stubFilesPromise
        text = stubs[path] ?? null

        // Handle common variants for package-style files
        if (text == null) {
          // 1) init.pyi (missing underscores) -> __init__.pyi
          if (/\/init\.pyi$/.test(path) && !/\/__init__\.pyi$/.test(path)) {
            const altInit = path.replace(/\/init\.pyi$/, '/__init__.pyi')
            if (stubs[altInit] != null) {
              text = stubs[altInit]
            }
          }
        }

        if (text == null) {
          // 2) /typings/pkg/__init__.pyi (or init.pyi) -> /typings/pkg.pyi
          const m = path.match(/^\/typings\/(.+)\/(?:__)?init\.pyi$/)
          if (m) {
            const alt = `/typings/${m[1]}.pyi`
            if (stubs[alt] != null) {
              text = stubs[alt]
            }
          }
        }

        if (text == null) text = ''
      } catch {
        text = ''
      }
    } else {
      // Unknown scheme/path — create empty model to allow peek UI
      text = ''
    }

    try {
      monaco.editor.createModel(text ?? '', 'python', uri)
    } catch {
      // Ignore model creation failures
    }
  }

  // Hover provider
  monaco.languages.registerHoverProvider('python', {
    provideHover: async (model, position) => {
      const uri = model.uri.toString()
      const hover = await lspClient.getHoverInfo(uri, { line: position.lineNumber - 1, character: position.column - 1 })
      if (!hover) return null
      return {
        contents: [
          {
            value: (hover.contents as MarkupContent).value,
          },
        ],
        range: hover.range ? toRange(hover.range) : undefined,
      }
    },
  })

  // Go to definition provider (enables Cmd/Ctrl+Click)
  monaco.languages.registerDefinitionProvider('python', {
    provideDefinition: async (model, position) => {
      const uri = model.uri.toString()
      const pos = { line: position.lineNumber - 1, character: position.column - 1 }
      let def = await lspClient.getDefinition(uri, pos)
      if (!def) {
        // Try fallbacks in priority order
        def = (await lspClient.getTypeDefinition(uri, pos))
          || (await lspClient.getDeclaration(uri, pos))
          || (await lspClient.getImplementation(uri, pos))
        if (!def) return null
      }

      // Normalize to simple Location[] for better compatibility across Monaco versions
      const locations: monaco.languages.Location[] = []
      const addLocation = async (uriStr: string, range: any) => {
        await ensureModelForUri(uriStr)
        locations.push({ uri: monaco.Uri.parse(uriStr), range: toRange(range) })
      }

      const defArr = Array.isArray(def) ? (def as any[]) : [def as any]

      if (Array.isArray(defArr)) {
        for (const d of defArr) {
          if (d && (d as any).targetUri) {
            const link = d as LocationLink
            await addLocation(link.targetUri, link.targetSelectionRange ?? link.targetRange)
          } else {
            const loc = d as Location
            await addLocation(loc.uri, loc.range)
          }
        }
      }

      // Prefer /sync-root and /typings first if multiple results
      locations.sort((a, b) => {
        const up = (u: string) => (u.startsWith('file:///sync-root/') ? 0 : u.startsWith('file:///typings/') ? 1 : 2)
        return up(a.uri.toString()) - up(b.uri.toString())
      })

      return locations
    },
  })

  // Signature help
  monaco.languages.registerSignatureHelpProvider('python', {
    signatureHelpTriggerCharacters: ['(', ','],
    provideSignatureHelp: async (model, position, _token, _context) => {
      const uri = model.uri.toString()
      const sig = await lspClient.getSignatureHelp(uri, { line: position.lineNumber - 1, character: position.column - 1 })
      if (!sig) return null
      return {
        value: {
          signatures: sig.signatures.map((s) => ({
            label: s.label,
            documentation: s.documentation as any,
            parameters: s.parameters as any,
          })) as any,
          activeSignature: sig.activeSignature ?? 0,
          activeParameter: sig.activeParameter ?? 0,
        },
        dispose: () => {},
      }
    },
  })

  // Completion + resolve
  monaco.languages.registerCompletionItemProvider('python', {
    triggerCharacters: ['.', '[', '"', "'"],
    provideCompletionItems: async (model, position) => {
      const uri = model.uri.toString()
      const res = (await lspClient.getCompletion(uri, { line: position.lineNumber - 1, character: position.column - 1 })) as CompletionList
      if (!res) return null
      return {
        suggestions: res.items.map((i) => convertCompletionItem(monaco, i, model)),
        incomplete: res.isIncomplete,
        dispose: () => {},
      }
    },
    resolveCompletionItem: async (item) => {
      const original = (item as any).__original as CompletionItem | undefined
      if (!original) return item
      const resolved = await lspClient.resolveCompletion(original)
      return resolved ? convertCompletionItem(monaco, resolved) : item
    },
  })

  // Rename
  monaco.languages.registerRenameProvider('python', {
    provideRenameEdits: async (model, position, newName) => {
      const uri = model.uri.toString()
      const edits = await lspClient.getRenameEdits(uri, { line: position.lineNumber - 1, character: position.column - 1 }, newName)
      if (!edits) return null

      const wsEdits: monaco.languages.IWorkspaceTextEdit[] = []
      if (edits.documentChanges) {
        for (const dc of edits.documentChanges as any[]) {
          if (dc && dc.textDocument && Array.isArray(dc.edits)) {
            const resUri = monaco.Uri.parse(dc.textDocument.uri)
            for (const te of dc.edits) {
              wsEdits.push({ resource: resUri, versionId: undefined, textEdit: { range: toRange(te.range), text: te.newText } })
            }
          }
        }
      }
      return { edits: wsEdits }
    },
  })

  // Semantic tokens
  monaco.languages.registerDocumentSemanticTokensProvider('python', {
    getLegend: () => ({
      tokenTypes: [
        'namespace',
        'type',
        'class',
        'enum',
        'typeParameter',
        'parameter',
        'variable',
        'property',
        'enumMember',
        'function',
        'method',
        'keyword',
        'decorator',
        'selfParameter',
        'clsParameter',
      ],
      tokenModifiers: ['declaration', 'definition', 'readonly', 'static', 'async', 'defaultLibrary', 'builtin', 'classMember', 'parameter'],
    }),
    provideDocumentSemanticTokens: async (model) => {
      const uri = model.uri.toString()
      const tokens = await lspClient.getSemanticTokens(uri)
      return tokens ? toSemanticTokens(tokens) : null
    },
    releaseDocumentSemanticTokens: () => {},
  })

  // Inlay hints
  monaco.languages.registerInlayHintsProvider('python', {
    provideInlayHints: async (model, range) => {
      const uri = model.uri.toString()
      const hints = await lspClient.getInlayHints(uri, fromRange(range))
      return { hints: (hints ?? []).map((h) => toInlayHint(h)), dispose: () => {} }
    },
  })
}

export function applyDiagnostics(monaco: typeof import('monaco-editor'), uri: string, diagnostics: Diagnostic[]) {
  const model = monaco.editor.getModel(monaco.Uri.parse(uri))
  if (!model) return

  const markers: monaco.editor.IMarkerData[] = diagnostics.map((d) => ({
    ...toRange(d.range),
    severity: convertSeverity(monaco, d.severity) as any,
    message: d.message,
    tags: d.tags,
  }))
  monaco.editor.setModelMarkers(model, 'pyright', markers)
}

function convertSeverity(monaco: typeof import('monaco-editor'), sev?: DiagnosticSeverity): monaco.MarkerSeverity {
  switch (sev) {
    case 1 /* Error */:
    default:
      return monaco.MarkerSeverity.Error
    case 2 /* Warning */:
      return monaco.MarkerSeverity.Warning
    case 3 /* Information */:
      return monaco.MarkerSeverity.Info
    case 4 /* Hint */:
      return monaco.MarkerSeverity.Hint
  }
}

function convertCompletionItem(monaco: typeof import('monaco-editor'), item: CompletionItem, model?: monaco.editor.ITextModel): monaco.languages.CompletionItem {
  const converted: monaco.languages.CompletionItem = {
    label: item.label as any,
    kind: convertCompletionItemKind(monaco, item.kind as any),
    tags: item.tags as any,
    detail: item.detail,
    documentation: item.documentation as any,
    sortText: item.sortText,
    filterText: item.filterText,
    preselect: item.preselect,
    insertText: (item.label as any) ?? '',
    range: undefined as any,
  }

  if ((item as any).textEdit) {
    const te: any = (item as any).textEdit
    converted.insertText = te.newText
    if (te && te.insert && te.replace) {
      converted.range = { insert: toRange(te.insert), replace: toRange(te.replace) } as any
    } else {
      converted.range = toRange(te.range)
    }
  }

  if (item.additionalTextEdits) {
    converted.additionalTextEdits = item.additionalTextEdits.map((e) => ({ range: toRange(e.range), text: e.newText }))
  }

  ;(converted as any).__original = item
  if (model) (converted as any).model = model
  return converted
}

function convertCompletionItemKind(monaco: typeof import('monaco-editor'), kind?: number): monaco.languages.CompletionItemKind {
  switch (kind) {
    case 21 /* Constant */:
      return monaco.languages.CompletionItemKind.Constant
    case 6 /* Variable */:
      return monaco.languages.CompletionItemKind.Variable
    case 3 /* Function */:
      return monaco.languages.CompletionItemKind.Function
    case 5 /* Field */:
      return monaco.languages.CompletionItemKind.Field
    case 14 /* Keyword */:
      return monaco.languages.CompletionItemKind.Keyword
    default:
      return monaco.languages.CompletionItemKind.Reference
  }
}
