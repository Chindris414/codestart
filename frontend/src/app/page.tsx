import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

import LogoutButton from "@/components/LogoutButton";
import type { User } from "@/lib/auth";

const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

type Health = { status: string; database: string };

async function getHealth(): Promise<Health | null> {
  try {
    const res = await fetch(`${backend}/api/health/`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Health;
  } catch {
    return null;
  }
}

// Ask Django who is logged in, forwarding the visitor's cookies (server-to-server)
async function getCurrentUser(): Promise<User | null> {
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

async function AccountBox() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex gap-3">
        <Link href="/login" className="rounded border px-3 py-1 text-sm">Log in</Link>
        <Link href="/signup" className="rounded bg-blue-600 px-3 py-1 text-sm text-white">Sign up</Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span>
        Signed in as <strong>{user.name || user.email}</strong>
      </span>
      <LogoutButton />
    </div>
  );
}

async function BackendStatus() {
  const health = await getHealth();

  return health ? (
    <p className="text-green-600">
      API: {health.status} · Database: {health.database}
    </p>
  ) : (
    <p className="text-red-600">
      Backend not reachable. Is Django running on port 8000?
    </p>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-bold">CodeStart</span>
        <Suspense fallback={<span className="text-sm text-gray-500">…</span>}>
          <AccountBox />
        </Suspense>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-4xl font-bold">CodeStart</h1>
        <p className="text-lg text-gray-600">Learn to code, one small step at a time.</p>

        <div className="rounded-lg border px-6 py-4 text-center">
          <p className="font-medium">Backend status</p>
          <Suspense fallback={<p className="text-gray-500">Checking…</p>}>
            <BackendStatus />
          </Suspense>
        </div>
      </main>
    </div>
  );
}