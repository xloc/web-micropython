// Loads MicroPython stub files (from /micropython-stubs) and
// maps them into the LSP's virtual filesystem under /typings.
// This makes modules like `machine` available to Pyright without
// requiring any files in the user's /sync-root workspace.

export async function loadMicropythonStubs(): Promise<Record<string, string>> {
  try {
    const manifestUrl = '/micropython-stubs/manifest.json';
    const res = await fetch(manifestUrl);
    if (!res.ok) return {};

    const manifest = (await res.json()) as { files: string[] };
    if (!manifest?.files || !Array.isArray(manifest.files)) return {};

    const entries = await Promise.all(
      manifest.files.map(async (relPath) => {
        const url = `/micropython-stubs/${relPath}`;
        try {
          const r = await fetch(url);
          if (!r.ok) return null;
          const text = await r.text();
          // Mount under /typings so pyright can find them via stubPath
          const vfsPath = `/typings/${relPath}`;
          return [vfsPath, text] as const;
        } catch {
          return null;
        }
      })
    );

    const files: Record<string, string> = {};
    for (const e of entries) {
      if (!e) continue;
      const [path, content] = e;
      files[path] = content;
    }
    return files;
  } catch {
    return {};
  }
}

