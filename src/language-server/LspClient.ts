/*
 * Lightweight LSP client for BasedPyright running in the browser.
 * Mirrors the playground approach (foreground + background workers)
 * and adapts it for our /sync-root workspace with OPFS.
 */

import 'remote-web-worker';
import {
  BrowserMessageReader,
  BrowserMessageWriter,
} from 'vscode-jsonrpc/browser';
import type {
  Diagnostic,
  DidChangeConfigurationParams,
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  Hover,
  HoverParams,
  InitializeParams,
  LogMessageParams,
  MessageConnection,
  Position,
  PublishDiagnosticsParams,
  RenameParams,
  SignatureHelp,
  SignatureHelpParams,
  CompletionItem,
  CompletionList,
  CompletionParams,
  WorkspaceEdit,
  SemanticTokensParams,
  SemanticTokens,
  InlayHintParams,
  InlayHint,
  Range,
} from 'vscode-languageserver-protocol';
import {
  DiagnosticTag,
  HoverRequest,
  InitializeRequest,
  NotificationType,
  RenameRequest,
  RequestType,
  SignatureHelpRequest,
  CompletionRequest,
  CompletionResolveRequest,
  SemanticTokensRequest,
  InlayHintRequest,
  createMessageConnection,
} from 'vscode-languageserver-protocol';
import { getPyrightVersions, packageName } from './sessionManager';
import { loadMicropythonStubs } from './micropythonStubs';
import type { SessionOptions } from './sessionManager';

const rootPath = '/sync-root/';
const rootUri = `file://${rootPath}`;

export interface LspClientNotifications {
  onWaitingForInitialization?: (isWaiting: boolean) => void;
  onDiagnostics?: (uri: string, diagnostics: Diagnostic[]) => void;
}

type DocState = {
  uri: string;
  text: string;
  version: number;
};

export class LspClient {
  public connection: MessageConnection | undefined;
  private _notifications: LspClientNotifications = {};
  private _documents = new Map<string, DocState>();

  requestNotification(notifications: LspClientNotifications) {
    this._notifications = notifications;
  }

  // Initialize the LSP connection and open initial files.
  public async initialize(sessionOptions?: SessionOptions, initialFiles?: Record<string, string>) {
    this._notifications.onWaitingForInitialization?.(true);

    // Prime documents from caller or with a default untitled file
    this._documents.clear();
    const seedFiles = initialFiles && Object.keys(initialFiles).length > 0
      ? initialFiles
      : { [`${rootPath}Untitled.py`]: '' };
    for (const [path, text] of Object.entries(seedFiles)) {
      const uri = toUri(path);
      this._documents.set(uri, { uri, text, version: 1 });
    }

    // Build worker URL from CDN (same pattern as playground)
    const version = sessionOptions?.pyrightVersion ?? (await getPyrightVersions())[0];
    const workerScript = `https://cdn.jsdelivr.net/npm/${packageName}@${version}/dist/pyright.worker.js`;

    const foreground = new Worker(workerScript, {
      name: 'Pyright-foreground',
      type: 'classic',
    });
    foreground.postMessage({ type: 'browser/boot', mode: 'foreground' });

    const connection = createMessageConnection(
      new BrowserMessageReader(foreground),
      new BrowserMessageWriter(foreground)
    );

    const workers: Worker[] = [foreground];
    connection.onDispose(() => {
      workers.forEach((w) => w.terminate());
    });

    let backgroundWorkerCount = 0;
    foreground.addEventListener('message', (e: MessageEvent) => {
      if (e.data && e.data.type === 'browser/newWorker') {
        const { initialData, port } = e.data;
        const background = new Worker(workerScript, {
          name: `Pyright-background-${++backgroundWorkerCount}`,
        });
        workers.push(background);
        background.postMessage(
          {
            type: 'browser/boot',
            mode: 'background',
            initialData,
            port,
          },
          [port]
        );
      }
    });

    this.connection = connection;
    this.connection.listen();

    // Initialize the server
    // Load built-in MicroPython stubs (e.g., machine) so imports resolve
    // without requiring any user files in /sync-root.
    const micropythonStubFiles = await loadMicropythonStubs();

    const files: Record<string, string> = { ...micropythonStubFiles };
    // seed open docs
    for (const doc of this._documents.values()) {
      files[fromUri(doc.uri)] = doc.text;
    }
    // pyright config at /sync-root: prefer provided config text when available
    const configKey = `${rootPath}pyrightconfig.json`;
    const providedConfigText = initialFiles?.[configKey];
    // Start with a minimal default; we'll patch in stubPath/typeshedPath as needed
    let cfgObj: any = { typeshedPath: '/typeshed' };
    try {
      if (providedConfigText) cfgObj = JSON.parse(providedConfigText);
    } catch {
      // ignore parse errors and fall back to default
    }

    // Ensure our stub path is available so /typings is searched.
    if (!cfgObj.stubPath) cfgObj.stubPath = '/typings';
    // Ensure a typeshed path (even if unused by our stubs)
    if (!cfgObj.typeshedPath) cfgObj.typeshedPath = '/typeshed';
    // Apply any runtime overrides last
    if (sessionOptions?.configOverrides) {
      cfgObj = { ...cfgObj, ...sessionOptions.configOverrides };
    }

    files[configKey] = JSON.stringify(cfgObj, null, 2);

    const init: InitializeParams = {
      rootUri,
      rootPath,
      processId: 1,
      capabilities: {
        textDocument: {
          publishDiagnostics: {
            tagSupport: {
              valueSet: [DiagnosticTag.Unnecessary, DiagnosticTag.Deprecated],
            },
            versionSupport: true,
          },
          hover: { contentFormat: ['markdown', 'plaintext'] },
          signatureHelp: {},
        },
      },
      initializationOptions: { files },
    };

    if (sessionOptions?.locale) {
      init.locale = sessionOptions.locale;
    }

    await this.connection.sendRequest(InitializeRequest.type, init);

    // Update the settings.
    await this.connection.sendNotification(
      new NotificationType<DidChangeConfigurationParams>('workspace/didChangeConfiguration'),
      { settings: {} }
    );

    // Open seeded files
    for (const doc of this._documents.values()) {
      await this.connection.sendNotification(
        new NotificationType<DidOpenTextDocumentParams>('textDocument/didOpen'),
        {
          textDocument: {
            uri: doc.uri,
            languageId: 'python',
            version: doc.version,
            text: doc.text,
          },
        }
      );
    }

    // Diagnostics
    this.connection.onNotification(
      new NotificationType<PublishDiagnosticsParams>('textDocument/publishDiagnostics'),
      (info) => {
        const diagVersion = info.version ?? -1;
        console.info(`Received diagnostics for version: ${diagVersion} (uri: ${info.uri})`);
        this._notifications.onDiagnostics?.(info.uri, info.diagnostics);
      }
    );

    // Logs
    this.connection.onNotification(
      new NotificationType<LogMessageParams>('window/logMessage'),
      (msg) => {
        console.info(`Language server log message: ${msg.message}`);
      }
    );

    // Config request handler
    this.connection.onRequest(
      new RequestType<any, any, any>('workspace/configuration'),
      (params) => {
        console.info(`Language server config request: ${JSON.stringify(params)}`);
        return [];
      }
    );

    this._notifications.onWaitingForInitialization?.(false);
  }

  async updateSettings(sessionOptions: SessionOptions, initialFiles?: Record<string, string>) {
    this.connection?.dispose();
    await this.initialize(sessionOptions, initialFiles);
  }

  // Document lifecycle
  async openDocument(uriOrPath: string, text: string) {
    const uri = uriOrPath.startsWith('file://') ? uriOrPath : toUri(uriOrPath);
    const doc: DocState = { uri, text, version: 1 };
    this._documents.set(uri, doc);
    await this.connection?.sendNotification(
      new NotificationType<DidOpenTextDocumentParams>('textDocument/didOpen'),
      {
        textDocument: {
          uri,
          languageId: 'python',
          version: doc.version,
          text: doc.text,
        },
      }
    );
  }

  async changeDocument(uriOrPath: string, newText: string) {
    const uri = uriOrPath.startsWith('file://') ? uriOrPath : toUri(uriOrPath);
    const doc = this._documents.get(uri);
    if (!doc) return;
    doc.version += 1;
    doc.text = newText;
    await this.connection?.sendNotification(
      new NotificationType<DidChangeTextDocumentParams>('textDocument/didChange'),
      {
        textDocument: { uri, version: doc.version },
        contentChanges: [{ text: newText }],
      }
    );
  }

  async closeDocument(uriOrPath: string) {
    const uri = uriOrPath.startsWith('file://') ? uriOrPath : toUri(uriOrPath);
    if (!this._documents.has(uri)) return;
    await this.connection?.sendNotification(
      new NotificationType<DidCloseTextDocumentParams>('textDocument/didClose'),
      { textDocument: { uri } }
    );
    this._documents.delete(uri);
  }

  hasDocument(uriOrPath: string): boolean {
    const uri = uriOrPath.startsWith('file://') ? uriOrPath : toUri(uriOrPath);
    return this._documents.has(uri);
  }

  // Language features (all require a target URI)
  async getHoverInfo(uri: string, position: Position): Promise<Hover | null> {
    try {
      const params: HoverParams = { textDocument: { uri }, position };
      if (!this.connection) return null;
      return await this.connection.sendRequest(HoverRequest.type, params);
    } catch {
      return null;
    }
  }

  async getRenameEdits(uri: string, position: Position, newName: string): Promise<WorkspaceEdit | null> {
    try {
      const params: RenameParams = { textDocument: { uri }, position, newName };
      if (!this.connection) return null;
      return await this.connection.sendRequest(RenameRequest.type, params);
    } catch {
      return null;
    }
  }

  async getSignatureHelp(uri: string, position: Position): Promise<SignatureHelp | null> {
    try {
      const params: SignatureHelpParams = { textDocument: { uri }, position };
      if (!this.connection) return null;
      return await this.connection.sendRequest(SignatureHelpRequest.type, params);
    } catch {
      return null;
    }
  }

  async getCompletion(uri: string, position: Position): Promise<CompletionList | CompletionItem[] | null> {
    try {
      const params: CompletionParams = { textDocument: { uri }, position };
      if (!this.connection) return null;
      return await this.connection.sendRequest(CompletionRequest.type, params);
    } catch {
      return null;
    }
  }

  async resolveCompletion(item: CompletionItem): Promise<CompletionItem | null> {
    try {
      if (!this.connection) return null;
      return await this.connection.sendRequest(CompletionResolveRequest.type, item);
    } catch {
      return null;
    }
  }

  async getSemanticTokens(uri: string): Promise<SemanticTokens | null> {
    const params: SemanticTokensParams = { textDocument: { uri } };
    try {
      if (!this.connection) return null;
      return await this.connection.sendRequest(SemanticTokensRequest.type, params);
    } catch {
      return null;
    }
  }

  async getInlayHints(uri: string, range: Range): Promise<InlayHint[] | null> {
    const params: InlayHintParams = { textDocument: { uri }, range };
    try {
      if (!this.connection) return null;
      return await this.connection.sendRequest(InlayHintRequest.type, params);
    } catch {
      return null;
    }
  }
}

// Helpers
export function toUri(path: string): string {
  if (path.startsWith('file://')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `file://${normalized}`;
}

export function fromUri(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}
