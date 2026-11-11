import Link from "next/link";
import { Suspense } from "react";

import { apiGet, type TrackListResponse } from "@/lib/learning";

export const metadata = { title: "Tracks · CodeStart" };

async function TrackList() {
  const data = await apiGet<TrackListResponse>("/api/tracks/");
  const tracks = data?.tracks ?? [];

  if (tracks.length === 0) {
    return <p className="text-gray-500">No tracks are published yet. Check back soon!</p>;
  }

  return (
    <ul className="space-y-4">
      {tracks.map((track) => (
        <li key={track.slug}>
          <Link
            href={`/tracks/${track.slug}`}
            className="block rounded-lg border p-5 hover:bg-gray-50"
          >
            <h2 className="text-xl font-semibold">{track.title}</h2>
            {track.description && <p className="mt-1 text-gray-600">{track.description}</p>}
            <p className="mt-2 text-sm text-gray-500">
              {track.module_count} module{track.module_count === 1 ? "" : "s"} ·{" "}
              {track.lesson_count} lesson{track.lesson_count === 1 ? "" : "s"}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function TracksPage() {
  return (
    <>
      <h1 className="mb-6 text-3xl font-bold">Tracks</h1>
      <Suspense fallback={<p className="text-gray-500">Loading tracks…</p>}>
        <TrackList />
      </Suspense>
    </>
  );
}
