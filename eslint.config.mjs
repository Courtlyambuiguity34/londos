import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='img']",
          message: "Use next/image with explicit dimensions and the platform media policy.",
        },
        {
          selector: "JSXOpeningElement[name.name='script']",
          message:
            "Use reviewed platform script configuration; do not embed raw scripts in components.",
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "node_modules/**",
    ".cache/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
