import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";

export default [
  eslint.configs.recommended,
  prettierConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: true,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      prettier: prettierPlugin,
      import: importPlugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // Turn off no-undef since TypeScript handles this
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unnecessary-type-constraint": "error",
      "prettier/prettier": "error",
      // Import sorting rules
      "import/order": [
        "error",
        {
          groups: [
            "builtin", // Node.js built-in modules
            "external", // External packages
            "internal", // Internal modules (same project)
            "parent", // Parent directory imports
            "sibling", // Sibling directory imports
            "index", // Current directory index
          ],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
      "import/newline-after-import": "error",
      "import/no-duplicates": "error",
      "no-empty": "warn",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "fs", "path", "os", "crypto"],
              message:
                "Node.js built-ins are not allowed in universal packages. Use @langfuse/otel for Node-specific functionality.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/otel/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["**/__tests__/**/*.ts", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-restricted-imports": "off",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "packages/core/src/api/"],
  },
];
