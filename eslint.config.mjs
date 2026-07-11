import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Mount-time reads of browser-only APIs (localStorage theme, `window`
      // feature checks, online/offline status) legitimately setState in an
      // effect — the React-Compiler-era rule flags the pattern, but these are
      // safe and idiomatic. Kept as a warning (visible), not an error (blocking).
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
