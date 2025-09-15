import type { FileNode } from '../stores/fileSystem'

/**
 * Find a node in the tree by path
 */
export const findNode = (tree: FileNode, path: string): FileNode | null => {
  if (tree.path === path) return tree

  if (tree.children) {
    for (const child of tree.children) {
      const found = findNode(child, path)
      if (found) return found
    }
  }
  return null
}

/**
 * Get all file nodes (not directories) from the tree
 */
export const getAllFiles = (tree: FileNode): FileNode[] => {
  const files: FileNode[] = []

  if (tree.type === 'file') {
    files.push(tree)
  }

  if (tree.children) {
    for (const child of tree.children) {
      files.push(...getAllFiles(child))
    }
  }

  return files
}

/**
 * Sort children in a tree node (directories first, then files, both alphabetically)
 */
export const sortChildren = (node: FileNode): FileNode => {
  if (node.children) {
    node.children.sort((a, b) => {
      // Directories first, then files
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      // Then alphabetically
      return a.name.localeCompare(b.name)
    })

    // Recursively sort children
    node.children.forEach(child => sortChildren(child))
  }

  return node
}

/**
 * Toggle expanded state of a directory node
 */
export const toggleExpanded = (tree: FileNode, path: string): FileNode => {
  const node = findNode(tree, path)
  if (node && node.type === 'directory') {
    node.isExpanded = !node.isExpanded
  }
  return tree
}

/**
 * Get the parent directory path of a given path
 */
export const getParentPath = (path: string): string => {
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 1) {
    return '/'
  }
  return '/' + parts.slice(0, -1).join('/')
}

/**
 * Get the filename/directory name from a path
 */
export const getFileName = (path: string): string => {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] || ''
}

/**
 * Get file extension from a filename
 */
export const getFileExtension = (filename: string): string => {
  const lastDot = filename.lastIndexOf('.')
  return lastDot !== -1 ? filename.substring(lastDot + 1) : ''
}

/**
 * Check if a file is a Python file
 */
export const isPythonFile = (filename: string): boolean => {
  const ext = getFileExtension(filename).toLowerCase()
  return ext === 'py' || ext === 'pyw'
}

/**
 * Generate a unique filename in a directory
 */
export const generateUniqueFileName = (directory: FileNode, baseName: string, extension = ''): string => {
  if (!directory.children) {
    return extension ? `${baseName}.${extension}` : baseName
  }

  const existingNames = new Set(directory.children.map(child => child.name))
  let counter = 1
  let fileName = extension ? `${baseName}.${extension}` : baseName

  while (existingNames.has(fileName)) {
    fileName = extension ? `${baseName}${counter}.${extension}` : `${baseName}${counter}`
    counter++
  }

  return fileName
}