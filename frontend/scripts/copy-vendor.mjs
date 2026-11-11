// Copies the browser files of Monaco (the code editor) and Pyodide (Python
// compiled to WebAssembly) from node_modules into public/, so the site serves
// them itself instead of loading them from a third-party CDN.
// Runs automatically before `npm run dev` and `npm run build`; the copies are
// gitignored. Each copy is skipped when the installed version is already there.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const VENDORS = [
  {
    name: "monaco-editor",
    target: "public/monaco",
    // The whole prebuilt editor, as public/monaco/vs/...
    copy: (pkg, target) => cpSync(join(pkg, "min", "vs"), join(target, "vs"), { recursive: true }),
    check: "min/vs/loader.js",
  },
  {
    name: "pyodide",
    target: "public/pyodide",
    // Only what the browser needs to start Python with its standard library.
    copy: (pkg, target) => {
      mkdirSync(target, { recursive: true });
      for (const file of [
        "pyodide.mjs",
        "pyodide.asm.mjs",
        "pyodide.asm.wasm",
        "python_stdlib.zip",
        "pyodide-lock.json",
      ]) {
        cpSync(join(pkg, file), join(target, file));
      }
    },
    check: "pyodide.asm.wasm",
  },
];

let failed = false;
for (const vendor of VENDORS) {
  const pkg = join(root, "node_modules", vendor.name);
  const target = join(root, vendor.target);
  const marker = join(target, "VERSION");

  if (!existsSync(join(pkg, vendor.check))) {
    console.error(`copy-vendor: ${vendor.name} not found in node_modules. Run npm install first.`);
    failed = true;
    continue;
  }
  const { version } = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
  if (existsSync(marker) && readFileSync(marker, "utf8").trim() === version) {
    console.log(`copy-vendor: ${vendor.name} ${version} already in ${vendor.target}`);
    continue;
  }
  rmSync(target, { recursive: true, force: true });
  vendor.copy(pkg, target);
  writeFileSync(marker, `${version}\n`);
  console.log(`copy-vendor: copied ${vendor.name} ${version} to ${vendor.target}`);
}
process.exit(failed ? 1 : 0);
