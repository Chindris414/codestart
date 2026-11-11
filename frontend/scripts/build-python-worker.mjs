// Bundles the Python Web Worker (src/lib/python/python.worker.ts) into
// public/python/worker.mjs as an ES module.
//
// Why not let Next.js bundle it: Turbopack starts bundled workers as
// "classic" workers, and Pyodide only runs in module workers. The page starts
// this file with new Worker("/python/worker.mjs", { type: "module" }).
// Runs before `npm run dev` and `npm run build`; the output is gitignored.
// While working on the worker in dev, rerun: npm run assets

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "public", "python", "worker.mjs");
mkdirSync(dirname(outfile), { recursive: true });

await build({
  entryPoints: [join(root, "src", "lib", "python", "python.worker.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: true,
  legalComments: "none",
  logLevel: "warning",
});
console.log("build-python-worker: wrote public/python/worker.mjs");
