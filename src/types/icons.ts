// File icon mapping types based on VS Code Material Icon Theme
export interface FileIconDefinition {
  name: string
  fileExtensions?: string[]
  fileNames?: string[]
  light?: boolean
}

export interface FolderIconDefinition {
  name: string
  folderNames?: string[]
  light?: boolean
}