"use client";

import loader, { type Monaco } from "@monaco-editor/loader";
import { useEffect, useState } from "react";

// Monaco is served from our own origin (copied into public/ by
// scripts/copy-vendor.mjs) instead of the jsDelivr CDN that the loader uses
// by default: no third-party requests from the lesson page, and the editor's
// web worker is same-origin.
export const MONACO_VS_PATH = "/monaco/vs";

// If Monaco has not finished loading by then, show the plain-text fallback.
export const MONACO_LOAD_TIMEOUT_MS = 20_000;

export type MonacoLoad =
  | { status: "loading"; monaco: null }
  | { status: "ready"; monaco: Monaco }
  | { status: "failed"; monaco: null };

const LOADING: MonacoLoad = { status: "loading", monaco: null };
const FAILED: MonacoLoad = { status: "failed", monaco: null };

let configured = false;

function configureLoader() {
  if (!configured) {
    loader.config({ paths: { vs: MONACO_VS_PATH } });
    configured = true;
  }
}

// Loads Monaco in the browser and reports its progress, turning load errors
// and timeouts into "failed" (the loader alone would just never resolve or
// reject unnoticed). It starts as "loading" on the server and on the first
// client render, so hydration matches and Monaco is never touched during SSR.
export function useMonacoStatus(timeoutMs: number = MONACO_LOAD_TIMEOUT_MS): MonacoLoad {
  const [state, setState] = useState<MonacoLoad>(LOADING);

  useEffect(() => {
    configureLoader();
    let settled = false;
    const loading = loader.init();

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        setState(FAILED);
      }
    }, timeoutMs);

    loading
      .then((monaco) => {
        if (!settled) {
          settled = true;
          setState({ status: "ready", monaco });
        }
      })
      .catch((error: unknown) => {
        // Cancelling on unmount rejects with { type: "cancelation" }; that is
        // not a failure, and the component is gone anyway.
        if ((error as { type?: string } | null)?.type === "cancelation") return;
        if (!settled) {
          settled = true;
          console.error("Code editor failed to load:", error);
          setState(FAILED);
        }
      });

    return () => {
      settled = true;
      clearTimeout(timer);
      loading.cancel();
    };
  }, [timeoutMs]);

  return state;
}
