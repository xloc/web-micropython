import dedent from "dedent";
import { loadPyodide, type PyodideInterface } from "pyodide";
import * as Comlink from "comlink";
import type { Completion, PyodideWorkerAPI, Signature, Name } from "./pyodide.types";

class PyodideWorkerAPIImpl implements PyodideWorkerAPI {
    pyodide!: PyodideInterface;

    async init() {
        const pyodide = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.28.2/full/"
        });

        let mountDir = "/mnt";
        pyodide.FS.mkdirTree(mountDir);

        await pyodide.loadPackage('micropip')
        await pyodide.runPythonAsync(dedent`
            import micropip
            await micropip.install('jedi')
            import jedi
            prj = jedi.Project('/mnt')
        `);

        this.pyodide = pyodide;
    }

    async infer(filePath: string, line: number, column: number): Promise<Name[]> {
        const proxy = await this.pyodide.runPythonAsync(dedent`
            import jedi
            script = jedi.Script(open('${filePath}').read(), path='${filePath}', project=jedi.Project('/mnt'))
            definition = script.infer(line=${line}, column=${column - 1})
            definition
        `)

        const result: Name[] = [];
        for (const definition of proxy) {
            const [st0, st1] = definition.get_definition_start_position()
            const [ed0, ed1] = definition.get_definition_end_position()

            result.push({
                name: definition.name.toString(),
                type: definition.type.toString(),
                docstring: definition.docstring().toString(),
                modulePath: definition.module_path.toString(),
                range: { startLineNumber: st0, startColumn: st1 + 1, endLineNumber: ed0, endColumn: ed1 + 1 }
            })
        }
        proxy.destroy();
        return result
    }

    async complete(filePath: string, line: number, column: number) {
        const proxy = await this.pyodide.runPythonAsync(dedent`
            import jedi
            script = jedi.Script(open('${filePath}').read(), path='${filePath}', project=jedi.Project('/mnt'))
            completions = script.complete(line=${line}, column=${column - 1})
            completions
        `)
        const result: Completion[] = [];
        for (const element of proxy) {
            result.push({
                name: element.name.toString(),
                type: element.type.toString(),
                docstring: element.docstring().toString(),
                modulePath: element.module_path.toString(),
                complete: element.complete.toString(),
                prefixLength: element.get_completion_prefix_length(),
                range: {
                    startLineNumber: line,
                    endLineNumber: line,
                    startColumn: column - element.get_completion_prefix_length(),
                    endColumn: column
                }
            })
        }
        proxy.destroy();
        return result
    }

    async signature(filePath: string, line: number, column: number) {
        const proxy = await this.pyodide.runPythonAsync(dedent`
            import jedi
            script = jedi.Script(open('${filePath}').read(), path='${filePath}', project=jedi.Project('/mnt'))
            signature = script.get_signatures(line=${line}, column=${column - 1})
            signature
        `)
        const result: Signature[] = [];
        for (const sig of proxy) {
            const params = sig.params.map((param: any) => ({
                name: param.name.toString(),
                type: param.type.toString(),
                docstring: param.docstring().toString(),
                modulePath: param.module_path.toString(),
                repr: param.to_string().toString(),
                kind: param.kind.toString(),
            }))
            result.push({
                iParam: sig.index,
                repr: sig.to_string().toString(),
                params,
            })
        }
        proxy.destroy();
        return result
    }

    async goto(filePath: string, line: number, column: number) {
        let proxy = await this.pyodide.runPythonAsync(dedent`
            import jedi
            script = jedi.Script(open('${filePath}').read(), path='${filePath}', project=jedi.Project('/mnt'))
            definition = script.goto(line=${line}, column=${column - 1})
            definition
        `)

        if (proxy.length === 0) return null;
        proxy = proxy[0];

        const [st0, st1] = proxy.get_definition_start_position()
        const [ed0, ed1] = proxy.get_definition_end_position()
        const result: Name = {
            name: proxy.name.toString(),
            type: proxy.type.toString(),
            docstring: proxy.docstring().toString(),
            modulePath: proxy.module_path.toString(),
            range: { startLineNumber: st0, startColumn: st1 + 1, endLineNumber: ed0, endColumn: ed1 + 1 }
        }
        proxy.destroy();
        return result
    }

    writeFile(filePath: string, content: string) {
        this.pyodide.FS.writeFile(filePath, content);
    }

    readFile(filePath: string) {
        try {
            // TODO: Fix TypeScript types for Pyodide FS.readFile - currently not in type definitions
            const array = (this.pyodide.FS as any).readFile(filePath);
            return new TextDecoder('utf-8').decode(array);
        } catch (e) {
            console.error(e, filePath);
            return null;
        }
    }

    ls(path: string): string[] {
        const files = this.pyodide.FS.readdir(path);
        return files.filter(file => file !== '.' && file !== '..');
    }
}

Comlink.expose(new PyodideWorkerAPIImpl());