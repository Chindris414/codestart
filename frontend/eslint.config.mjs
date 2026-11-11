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
    // Monaco's and Pyodide's prebuilt files, copied in by scripts/copy-vendor.mjs.
    "public/monaco/**",
    "public/pyodide/**",
    "public/python/**",
  ]),
]);

export default eslintConfig;
