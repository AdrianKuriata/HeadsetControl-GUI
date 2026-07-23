/// <reference types="vite/client" />

// No `declare module "*.vue"` shim on purpose: vue-tsc resolves single-file
// components directly, and the shim would flatten their real props/emits types
// to `any` (and trips @typescript-eslint/no-explicit-any).

interface ImportMetaEnv {
  /** `mock` swaps the Tauri IPC backend for the scripted MockBackend. */
  readonly VITE_BACKEND?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
