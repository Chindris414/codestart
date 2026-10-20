import { Suspense } from "react";

type Health = { status: string; database: string };

async function getHealth(): Promise<Health | null> {
  const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${backend}/api/health/`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Health;
  } catch {
    return null;
  }
}

// The live part: fetched fresh on every request, streamed in after the page shell.
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

// The static part: prerendered, loads instantly.
export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">CodeStart</h1>
      <p className="text-lg text-gray-600">Learn to code, one small step at a time.</p>

      <div className="rounded-lg border px-6 py-4 text-center">
        <p className="font-medium">Backend status</p>
        <Suspense fallback={<p className="text-gray-500">Checking…</p>}>
          <BackendStatus />
        </Suspense>
      </div>
    </main>
  );
}