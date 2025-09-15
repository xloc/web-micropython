import type { IRange } from "monaco-editor";
import type * as Comlink from 'comlink';

export interface Name {
    name: string;
    type: string;
    docstring: string;
    range: IRange;
    modulePath: string;
}

export interface Completion extends Name {
    complete: string;
    prefixLength: number;
}

export interface ParamName extends Name {
    repr: string;
    kind: string;
}

export interface Signature {
    iParam: number | null;
    repr: string;
    params: ParamName[];
}

export interface FileSystemEntry {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size: number;
    lastModified: number;
}

export interface PyodideWorkerAPI {
    init(): Promise<void>;

    /**
     * infer python definition
     * @param filePath file to infer definition
     * @param line 1-based line number
     * @param column 1-based column number
     */
    infer(filePath: string, line: number, column: number): Promise<Name[]>;
    /**
     * auto completion
     * @param filePath file to infer definition
     * @param line 1-based line number
     * @param column 1-based column number
     */
    complete(filePath: string, line: number, column: number): Promise<Completion[]>;
    /**
     * get function signature
     * @param filePath file to infer definition
     * @param line 1-based line number
     * @param column 1-based column number
     */
    signature(filePath: string, line: number, column: number): Promise<Signature[]>;
    /**
     * go to the name that defined the object under the cursor
     * @param filePath file to infer definition
     * @param line 1-based line number
     * @param column 1-based column number
     */
    goto(filePath: string, line: number, column: number): Promise<Name | null>;

    writeFile(filePath: string, content: string): void;
    readFile(filePath: string): string | null;

    ls(path: string): string[];

    // File system operations
    createDirectory(path: string): Promise<void>;
    deleteFile(path: string): Promise<void>;
    deleteDirectory(path: string): Promise<void>;
    renameEntry(oldPath: string, newPath: string): Promise<void>;
    readDirectory(path: string): Promise<FileSystemEntry[]>;
    getFileTree(rootPath: string): Promise<FileSystemEntry>;
    exists(path: string): Promise<boolean>;
    isDirectory(path: string): Promise<boolean>;
}

export type RemotePyodideWorkerAPI = Comlink.Remote<PyodideWorkerAPI>