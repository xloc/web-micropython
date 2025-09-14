import { useMonaco } from '@guolao/vue-monaco-editor';
import { useLocalStorage } from '@vueuse/core';
import dedent from 'dedent';
import { editor, Uri } from 'monaco-editor';
import { defineStore } from 'pinia';
import { nextTick, onMounted, shallowRef, watch } from 'vue';
import * as Comlink from 'comlink';
import type { PyodideWorkerAPI, RemotePyodideWorkerAPI } from '../workers/pyodide.types';
import { PythonLanguageService } from '../services/pythonLanguageService';

const worker = new Worker(new URL('../workers/pyodide.worker.ts', import.meta.url), {
    type: 'module',
    name: 'pyodide-worker'
});

const writeExampleFiles = async (pyodide: RemotePyodideWorkerAPI) => {
    await pyodide.writeFile('/mnt/test.py', 'print("Hello World")');
    await pyodide.writeFile('/mnt/class_a.py', dedent`
        class A:
            @property
            def some_value(self):
                """some value doc"""
                return 1
            def foo(self):
                """foo doc"""
                pass
    `);
    await pyodide.writeFile('/mnt/import_a.py', dedent`
        from class_a import A
        def bar(a: A):
            a.some_value
            a.foo()
    `);
    await pyodide.writeFile('/mnt/completion.py', dedent`
        def foo(a, b, c=0, *, d=None):
            """
            Parameters:
            a: First parameter, required
            b: Second parameter, required
            c: Optional parameter, defaults to 0
            d: Keyword-only parameter, defaults to None
            """
            pass
    `);
}

export const usePyodideStore = defineStore('pyodide', () => {
    const editorRef = shallowRef<editor.IEditor>();
    const pyodideRef = shallowRef<RemotePyodideWorkerAPI>()
    const { monacoRef } = useMonaco();
    const editingFilePath = useLocalStorage<string | undefined>('editingFilePath', undefined)

    onMounted(async () => {
        console.log('🚀 Initializing Pyodide worker...');
        try {
            const workerApi = Comlink.wrap<PyodideWorkerAPI>(worker);
            await workerApi.init();
            await writeExampleFiles(workerApi);

            // After pyodide is initialized, we can use it
            pyodideRef.value = workerApi;
            console.log('✅ Pyodide worker initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Pyodide worker:', error);
        }
    })

    // Automatically handle file loading when editor, monaco, path, or pyodide changes
    watch(
        () => [editorRef.value, monacoRef.value, editingFilePath.value, pyodideRef.value] as const,
        async ([editor, monaco, path, pyodide]) => {
            if (!editor || !monaco || !path || !pyodide) return;

            const existingModel = monaco.editor.getModel(Uri.parse(path));
            if (existingModel) {
                editor.setModel(existingModel);
            } else {
                const text = await pyodide.readFile(path);
                if (!text) {
                    console.error('Failed to read file', path);
                    return;
                }
                const model = monaco.editor.createModel(text, 'python', Uri.parse(path));
                editor.setModel(model);
            }
        }
    );

    // Automatically register language features when both Monaco and Pyodide are ready
    const stopRegisterLang = watch(
        () => [monacoRef.value, pyodideRef.value] as const,
        ([monaco, pyodide]) => {
            if (!monaco || !pyodide) return;
            nextTick(() => stopRegisterLang());

            console.log('📝 Registering Python language features...');
            new PythonLanguageService(pyodide).register(monaco)
        }
    );

    return {
        pyodide: pyodideRef,
        monaco: monacoRef,
        editingFilePath,
        editor: editorRef
    }
})