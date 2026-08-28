import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

// Le code tourne dans trois environnements distincts : le navigateur (src/),
// Node côté Netlify (netlify/functions/) et le service worker (public/sw.js).
// Chacun a ses variables globales, d'où les blocs séparés.
export default [
  { ignores: ["dist/**", "node_modules/**"] },

  {
    files: ["src/**/*.{js,jsx}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Les blocs catch volontairement vides sont commentés dans le code
      "no-unused-vars": ["error", { caughtErrors: "none" }],
    },
  },

  {
    files: ["netlify/**/*.{js,mjs}", "*.config.js", "tests/**/*.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node, ...globals.es2023 },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["error", { caughtErrors: "none" }],
    },
  },
  {
    files: ["netlify/**/*.js"],
    languageOptions: { sourceType: "commonjs" },
  },

  {
    files: ["public/sw.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "script",
      globals: globals.serviceworker,
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["error", { caughtErrors: "none" }],
    },
  },
];
