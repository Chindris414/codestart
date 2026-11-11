import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import LessonList from "@/components/LessonList";
import { apiGet, type TrackDetailResponse } from "@/lib/learning";

type Params = PageProps<"/tracks/[track]">["params"];

async function TrackDetail({ params }: { params: Params }) {
  const { track } = await params;
  const data = await apiGet<TrackDetailResponse>(`/api/tracks/${encodeURIComponent(track)}/`);
  if (!data) notFound();

  return (
    <>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/tracks" className="hover:underline">Tracks</Link>
      </nav>
      <h1 className="text-3xl font-bold">{data.track.title}</h1>
      {data.track.description && <p className="mt-2 text-gray-600">{data.track.description}</p>}

      <div className="mt-8 space-y-8">
        {data.modules.map((module) => (
          <section key={module.slug}>
            <h2 className="mb-1 text-xl font-semibold">
              <Link href={`/tracks/${data.track.slug}/${module.slug}`} className="hover:underline">
                {module.order}. {module.title}
              </Link>
            </h2>
            {module.description && <p className="mb-3 text-sm text-gray-600">{module.description}</p>}
            <LessonList trackSlug={data.track.slug} moduleSlug={module.slug} lessons={module.lessons} />
          </section>
        ))}
        {data.modules.length === 0 && <p className="text-gray-500">No modules here yet.</p>}
      </div>
    </>
  );
}

export default function TrackPage({ params }: PageProps<"/tracks/[track]">) {
  return (
    <Suspense fallback={<p className="text-gray-500">Loading track…</p>}>
      <TrackDetail params={params} />
    </Suspense>
  );
}
