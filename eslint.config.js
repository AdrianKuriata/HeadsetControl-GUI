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
  // Type-aware, not just syntactic. What this buys over `recommended`:
  // `no-floating-promises` and `no-misused-promises`, which are the rules that
  // matter in a codebase where every backend call is async and a dropped
  // rejection would be swallowed rather than shown (`src/core/probe.ts`).
  tseslint.configs.recommendedTypeChecked,
  pluginVue.configs["flat/recommended"],
  {
    // `projectService` finds the tsconfig for each file instead of naming one,
    // which is what lets `src/**` and the two config files be linted from the
    // same run.
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".vue"],
      },
    },
  },
  // Plain JS tooling has no program behind it — the type-aware rules cannot run
  // there and would only error about a missing project.
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    rules: {
      // ESLint's TypeScript parser cannot resolve a `.vue` import — only vue-tsc
      // can — so every component that reaches TypeScript arrives as an error
      // type and the `no-unsafe-*` family fires on it (`screens/registry.ts`,
      // `main.ts`). They report the parser's blind spot, not the code, and type
      // soundness is already `make fe-typecheck`'s job.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      // `HeadsetBackend` is an async interface. An implementation that has a
      // ready answer — MockBackend's — still has to return a promise, and
      // dropping `async` to satisfy this rule would only mean writing
      // `Promise.resolve` by hand.
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // No user-facing string literals in templates — everything goes through
      // vue-i18n (issue #7 acceptance criterion). Technical constants (paths,
      // commands, capability ids) render via interpolation and are not flagged.
      "vue/no-bare-strings-in-template": "error",
    },
  },
  {
    files: ["src/**/*.{ts,vue}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: [
      "*.config.{js,ts}",
      "*.config.*.{js,ts}",
      "scripts/**/*.{js,mjs}",
      // The smoke runner and the Playwright suite drive the app from outside it.
      "smoke/**/*.mjs",
      "e2e/**/*.ts",
    ],
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
