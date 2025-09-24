// Minimal session manager for BasedPyright browser worker.
// Keeps the worker URL logic aligned with the playground example.

// Use the browser-distributed package on the CDN
export const packageName = 'browser-basedpyright';

// In this project we don't fetch versions at runtime (no network here).
// Returning 'latest' lets the browser load the latest worker from the CDN.
export async function getPyrightVersions(): Promise<string[]> {
  return ['latest'];
}

export interface SessionOptions {
  pyrightVersion?: string;
  locale?: string;
  // Arbitrary pyrightconfig.json overrides
  configOverrides?: Record<string, any>;
}
