// Server-side only: ask Django who is logged in, forwarding the visitor's
// cookies (server-to-server). Shared by the site header and pages that adapt
// to the viewer, like the lesson page (autosave target).

import { cookies } from "next/headers";

import type { User } from "./auth";

const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export async function getCurrentUser(): Promise<User | null> {
  const cookieHeader = (await cookies()).toString();
  try {
    const res = await fetch(`${backend}/api/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: User | null };
    return data.user;
  } catch {
    return null;
  }
}
