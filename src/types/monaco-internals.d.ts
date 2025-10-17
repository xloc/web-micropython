declare module 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices' {
  import type { ServiceIdentifier } from 'monaco-editor/esm/vs/platform/instantiation/common/instantiation'

  export const StandaloneServices: {
    get<T>(service: ServiceIdentifier<T>): T
  }
}

declare module 'monaco-editor/esm/vs/platform/instantiation/common/instantiation' {
  export type ServiceIdentifier<T> = symbol & { readonly __serviceBrand: T }
}

declare module 'monaco-editor/esm/vs/platform/contextview/browser/contextView' {
  import type { IAction } from 'monaco-editor/esm/vs/base/common/actions'
  import type { ServiceIdentifier } from 'monaco-editor/esm/vs/platform/instantiation/common/instantiation'

  export interface IContextMenuDelegate {
    getAnchor(): { x: number; y: number } | HTMLElement
    getActions(): IAction[]
    onHide?(): void
  }

  export interface IContextMenuMenuDelegate extends Omit<IContextMenuDelegate, 'getActions'> {
    menuId?: unknown
    getActions?(): IAction[]
  }

  export interface IContextMenuService {
    showContextMenu(delegate: IContextMenuDelegate | IContextMenuMenuDelegate): void
  }

  export const IContextMenuService: ServiceIdentifier<IContextMenuService>
}

declare module 'monaco-editor/esm/vs/base/common/actions' {
  export interface IAction {
    readonly id: string
    label: string
    enabled: boolean
    run(event?: unknown): void | Promise<void>
  }

  export class Action implements IAction {
    constructor(
      id: string,
      label: string,
      cssClass: string | undefined,
      enabled: boolean,
      run: () => void | Promise<void>
    )

    readonly id: string
    label: string
    enabled: boolean
    run(event?: unknown): void | Promise<void>
  }
}
