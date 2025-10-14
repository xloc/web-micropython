// Loads MicroPython stub files (from src/assets/micropython-stubs) and
// maps them into the LSP's virtual filesystem under /typings.
// This makes modules like `machine` available to Pyright without
// requiring any files in the user's /sync-root workspace.

// Vite's import.meta.glob auto-discovers stubs and provides fetchable URLs
const stubUrls = import.meta.glob('/src/assets/micropython-stubs/**/*.pyi', {
  eager: true,
  query: '?url',
  import: 'default',
})

export async function loadMicropythonStubs(): Promise<Record<string, string>> {
  try {
    const files: Record<string, string> = {};

    const entries = await Promise.all(
      Object.entries(stubUrls).map(async ([globPath, url]) => {
        try {
          const r = await fetch(url as string);
          if (!r.ok) return null;
          const text = await r.text();
          // Convert glob path to VFS path
          // /src/assets/micropython-stubs/machine.pyi -> /typings/machine.pyi
          const relPath = globPath.replace('/src/assets/micropython-stubs/', '');
          const vfsPath = `/typings/${relPath}`;
          return [vfsPath, text] as const;
        } catch {
          return null;
        }
      })
    );

    for (const e of entries) {
      if (!e) continue;
      const [path, content] = e;
      files[path] = content;
    }

    // Add package-style aliases for modules: /typings/pkg/__init__.pyi -> contents of /typings/pkg.pyi
    // Some tools refer to package form even if only a flat module stub exists.
    for (const key of Object.keys(files)) {
      if (key.startsWith('/typings/') && key.endsWith('.pyi')) {
        const rel = key.replace('/typings/', '')
        if (!rel.includes('/')) {
          const mod = rel.replace(/\.pyi$/, '')
          const pkgInit = `/typings/${mod}/__init__.pyi`
          if (!(pkgInit in files)) {
            files[pkgInit] = files[key]
          }
        }
      }
    }
    return files;
  } catch {
    return {};
  }
}
