import type { FileIconDefinition, FolderIconDefinition } from '../types/icons'

// File icon definitions
export const fileIcons: FileIconDefinition[] = [
  {
    name: 'python',
    fileExtensions: ['py', 'pyi', 'pyw', 'pyx']
  },
  {
    name: 'json',
    fileExtensions: ['json'],
    fileNames: ['package.json', 'tsconfig.json', 'composer.json']
  },
  {
    name: 'markdown',
    fileExtensions: ['md', 'markdown', 'mdown', 'mkdn', 'mkd']
  },
  {
    name: 'document',
    fileExtensions: ['txt', 'text', 'rtf']
  },
  {
    name: 'table',
    fileExtensions: ['csv', 'tsv']
  },
  {
    name: 'javascript',
    fileExtensions: ['js', 'mjs', 'cjs']
  },
  {
    name: 'typescript',
    fileExtensions: ['ts', 'mts', 'cts']
  },
  {
    name: 'html',
    fileExtensions: ['html', 'htm']
  },
  {
    name: 'css',
    fileExtensions: ['css']
  },
  {
    name: 'image',
    fileExtensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico']
  }
]

// Folder icon definitions
export const folderIcons: FolderIconDefinition[] = [
  {
    name: 'folder-src',
    folderNames: ['src', 'source']
  },
  {
    name: 'folder-utils',
    folderNames: ['utils', 'util', 'utilities']
  },
  {
    name: 'folder-assets',
    folderNames: ['assets', 'static', 'public']
  }
]

// Default icons
export const DEFAULT_FILE_ICON = 'file'
export const DEFAULT_FOLDER_ICON = 'folder'
export const DEFAULT_FOLDER_OPEN_ICON = 'folder-open'

/**
 * Get the icon name for a file based on its name and extension
 */
export function getFileIcon(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase()

  // Check specific file names first
  for (const icon of fileIcons) {
    if (icon.fileNames?.some((name: string) => fileName.toLowerCase() === name.toLowerCase())) {
      return icon.name
    }
  }

  // Check file extensions
  if (extension) {
    for (const icon of fileIcons) {
      if (icon.fileExtensions?.includes(extension)) {
        return icon.name
      }
    }
  }

  return DEFAULT_FILE_ICON
}

/**
 * Get the icon name for a folder based on its name
 */
export function getFolderIcon(folderName: string, isOpen: boolean = false): string {
  // Check for specific folder names
  for (const icon of folderIcons) {
    if (icon.folderNames?.some((name: string) => folderName.toLowerCase() === name.toLowerCase())) {
      return isOpen ? `${icon.name}-open` : icon.name
    }
  }

  // Return default folder icon
  return isOpen ? DEFAULT_FOLDER_OPEN_ICON : DEFAULT_FOLDER_ICON
}

/**
 * Get the SVG import path for an icon
 */
export function getIconPath(iconName: string): string {
  return `/node_modules/material-icon-theme/icons/${iconName}.svg`
}