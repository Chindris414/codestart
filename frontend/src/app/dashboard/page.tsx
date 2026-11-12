import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/currentUser";
import { apiGet, type DashboardResponse, type TrackProgress } from "@/lib/learning";

// The daily-learning starting point from the spec: where you left off, how
// far you have got, and how many days in a row you have practised.

function Bar({ percent }: { percent: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
      <div className="h-full rounded-full bg-green-700" style={{ width: `${percent}%` }} />
    </div>
  );
}

function StreakCard({ streak }: { streak: number }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-gray-600">Daily streak</p>
      <p className="mt-1 text-2xl font-bold">
        🔥 {streak} {streak === 1 ? "day" : "days"}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {streak === 0
          ? "Do one lesson today to start a streak."
          : "Keep it going — practise again today."}
      </p>
    </div>
  );
}

function TrackCard({ track }: { track: TrackProgress }) {
  return (
    <section className="rounded-lg border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">
          <Link href={`/tracks/${track.slug}`} className="hover:underline">
            {track.title}
          </Link>
        </h2>
        <p className="text-sm text-gray-600">
          {track.percent}% · {track.completed_count} of {track.lesson_count} lessons
        </p>
      </div>
      <div className="mt-3">
        <Bar percent={track.percent} />
      </div>

      <ul className="mt-5 space-y-3">
        {track.modules.map((module) => (
          <li key={module.slug}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link
                href={`/tracks/${track.slug}/${module.slug}`}
                className="text-sm font-medium hover:underline"
              >
                {module.order}. {module.title}
              </Link>
              <span className="text-xs text-gray-500">
                {module.percent}% · {module.completed_count}/{module.lesson_count}
              </span>
            </div>
            <div className="mt-1">
              <Bar percent={module.percent} />
            </div>
          </li>
        ))}
        {track.modules.length === 0 && (
          <li className="text-sm text-gray-500">No modules here yet.</li>
        )}
      </ul>
    </section>
  );
}

async function Dashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");

  const data = await apiGet<DashboardResponse>("/api/me/dashboard/");
  if (!data) return <p className="text-gray-500">Your progress is not available right now.</p>;

  const continueTo = data.continue_to;

  return (
    <>
      <h1 className="text-3xl font-bold">Your learning</h1>
      <p className="mt-1 text-gray-600">Welcome back, {user.name || user.email}.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-gray-600">Continue where you left off</p>
          {continueTo ? (
            <>
              <p className="mt-1 font-medium">{continueTo.title}</p>
              <Link
                href={`/tracks/${continueTo.track}/${continueTo.module}/${continueTo.lesson}`}
                className="mt-3 inline-block rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white"
              >
                Continue
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm text-gray-500">
              You have finished everything available. More lessons are on the way.
            </p>
          )}
        </div>
        <StreakCard streak={data.streak} />
      </div>

      <div className="mt-8 space-y-6">
        {data.tracks.map((track) => (
          <TrackCard key={track.slug} track={track} />
        ))}
        {data.tracks.length === 0 && <p className="text-gray-500">No tracks are published yet.</p>}
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <Suspense fallback={<p className="text-gray-500">Loading your progress…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}
