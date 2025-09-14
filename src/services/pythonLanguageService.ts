import * as monaco from 'monaco-editor';
import type { RemotePyodideWorkerAPI } from '../workers/pyodide.types';

type ITextModel = monaco.editor.ITextModel;
type Position = monaco.Position;

export class PythonLanguageService implements
    monaco.languages.HoverProvider,
    monaco.languages.CompletionItemProvider,
    monaco.languages.SignatureHelpProvider,
    monaco.languages.DefinitionProvider {

    pyodide: RemotePyodideWorkerAPI;
    constructor(pyodide: RemotePyodideWorkerAPI) {
        this.pyodide = pyodide;
    }

    register(monacoInstance: typeof monaco) {
        monacoInstance.languages.register({ id: 'python', extensions: ['.py'], aliases: ['Python', 'python'] });
        monacoInstance.languages.registerHoverProvider('python', this);
        monacoInstance.languages.registerCompletionItemProvider('python', this);
        monacoInstance.languages.registerSignatureHelpProvider('python', this);
        monacoInstance.languages.registerDefinitionProvider('python', this);
        monacoInstance.editor.registerEditorOpener(this);

        console.log('✅ Python language service registered successfully');
    }

    async openCodeEditor(
        sourceEditor: monaco.editor.ICodeEditor,
        resource: monaco.Uri,
        selectionOrOptions?: monaco.IRange
    ): Promise<boolean> {
        const text = await this.pyodide.readFile(resource.path);
        if (!text) {
            console.error('Failed to read file', resource.path);
            return false;
        }

        // Create or get model for the resource
        let model = monaco.editor.getModel(resource);
        if (!model) {
            model = monaco.editor.createModel(text, 'python', resource);
        }

        // Set the model to the source editor instead of creating a new one
        sourceEditor.setModel(model);

        // Apply selection if provided
        if (selectionOrOptions && 'startLineNumber' in selectionOrOptions) {
            sourceEditor.setSelection(selectionOrOptions);
            sourceEditor.revealRangeInCenter(selectionOrOptions);
        }

        console.log('openCodeEditor', resource.path);
        return true;
    }

    async provideHover(model: ITextModel, position: Position): Promise<monaco.languages.Hover | null> {
        const code = model.getValue();
        const path = model.uri.path;
        await this.pyodide.writeFile(path, code);
        const { lineNumber: line, column } = position;
        const name = await this.pyodide.infer(path, line, column);

        if (name.length === 0) return null;
        return {
            range: name[0].range,
            contents: [{ value: name[0].docstring }],
        }
    }

    triggerCharacters = ['.', '(']
    async provideCompletionItems(model: ITextModel, position: Position) {
        console.log('🔍 Python completion triggered!', { position, language: model.getLanguageId() });

        const code = model.getValue();
        const path = model.uri.path;
        await this.pyodide.writeFile(path, code);
        const { lineNumber: line, column } = position;

        try {
            const completions = await this.pyodide.complete(path, line, column);
            console.log('✅ Got completions from Pyodide:', completions.length);

            return {
                suggestions: completions.map((element) => ({
                    label: element.name,
                    kind: monaco.languages.CompletionItemKind.Variable,
                    insertText: element.name.toString(),
                    range: element.range,
                    documentation: { value: element.docstring },
                })),
                incomplete: false,
            }
        } catch (error) {
            console.error('❌ Completion error:', error);
            return { suggestions: [], incomplete: false };
        }
    }

    signatureHelpTriggerCharacters = ['(', ',']
    async provideSignatureHelp(model: ITextModel, position: Position): Promise<monaco.languages.SignatureHelpResult | null> {
        const code = model.getValue();
        const path = model.uri.path;
        await this.pyodide.writeFile(path, code);
        const { lineNumber: line, column } = position
        const signatures = await this.pyodide.signature(path, line, column);
        console.log('signature', signatures);

        if (signatures.length === 0) return null;

        if (signatures[0].iParam === null) {
            return null;
        }

        const value: monaco.languages.SignatureHelp = {
            signatures: signatures.map((sig) => ({
                label: sig.repr,
                parameters: sig.params.map((param) => ({
                    label: param.repr,
                    documentation: { value: param.docstring },
                })),
            })),
            activeSignature: 0,
            activeParameter: signatures[0].iParam,
        };

        return {
            value,
            dispose: () => { }
        };
    }

    async provideDefinition(model: ITextModel, position: Position) {
        const code = model.getValue();
        const path = model.uri.path;
        await this.pyodide.writeFile(path, code);
        const { lineNumber: line, column } = position;

        const definition = await this.pyodide.goto(path, line, column);
        if (!definition) return null;

        const uri = monaco.Uri.file(definition.modulePath);

        return {
            uri,
            range: definition.range,
        };
    }
}