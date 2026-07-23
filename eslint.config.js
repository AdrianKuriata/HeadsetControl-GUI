import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import pluginVue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier/flat";

// Flat config. Formatting is Prettier's job (`npm run format`); `prettier` last
// disables every ESLint rule that would fight it.
export default defineConfig(
  globalIgnores([
    "dist/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "src-tauri/**",
    "src/core/types.gen.ts",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  pluginVue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    files: ["src/**/*.{ts,vue}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ["*.config.{js,ts}", "*.config.*.{js,ts}", "scripts/**/*.{js,mjs}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  // `src/core/backend.ts` is the only module allowed to talk to Tauri
  // (PROJECT.md §3.2). Everything else depends on its interface, which is what
  // lets the whole UI run against the MockBackend.
  {
    files: ["src/**/*.{ts,vue}"],
    ignores: ["src/core/backend.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@tauri-apps/api", "@tauri-apps/api/*"],
              message:
                "Only src/core/backend.ts may call invoke()/listen(); depend on HeadsetBackend instead.",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
