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

/**
 * Whether this build carries {@link MockBackend} at all — replaced with a literal
 * `true`/`false` at build time (`define` in `vite.config.ts` / `vitest.config.ts`).
 *
 * A plain `import.meta.env.VITE_BACKEND` check cannot do this job: Vite only
 * substitutes env vars that are actually set, so in a real production build the
 * expression survives as a runtime property read and the bundler has to assume
 * the mock is reachable. A `define` is substituted either way, which is what lets
 * the scripted backend and its fixtures be dropped from what users install.
 */
declare const __MOCK_BACKEND__: boolean;
