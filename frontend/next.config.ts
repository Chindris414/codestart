import type { NextConfig } from "next";

const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Cross-origin isolation, needed for SharedArrayBuffer: the Python worker
  // uses it to wait for input() without freezing the page, and to stop
  // endless loops gently. Applied to every path (pages, scripts, the worker
  // and Pyodide's files), since isolation is decided when a page is first
  // loaded, before any client-side navigation to a lesson. Everything the
  // site loads is same-origin, which require-corp allows.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
      {
        // The Python worker keeps the same URL between builds; make browsers
        // check for a new version instead of using a cached one.
        source: "/python/:file*",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
