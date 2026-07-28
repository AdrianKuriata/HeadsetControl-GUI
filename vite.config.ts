import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => ({
  plugins: [vue(), tailwindcss()],

  // Whether MockBackend is compiled in at all. A literal, so the bundler can see
  // the branch in `src/core/create-backend.ts` is dead and drop the scripted
  // backend from anything users install — see `src/vite-env.d.ts` for why an
  // `import.meta.env` check cannot replace this.
  //
  // The flag is read through `loadEnv` rather than off `process.env`, because
  // the two ways of asking for the mock set it differently: `make dev-mock`
  // exports it into the environment, while `vite build --mode mock` (the E2E
  // build, #13) only has it in `.env.mock`. `loadEnv` sees both.
  define: {
    // @ts-expect-error process is a nodejs global
    __MOCK_BACKEND__: JSON.stringify(loadEnv(mode, process.cwd(), "VITE_").VITE_BACKEND === "mock"),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
