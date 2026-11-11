import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import LessonList from "@/components/LessonList";
import { apiGet, type ModuleDetailResponse } from "@/lib/learning";

type Params = PageProps<"/tracks/[track]/[module]">["params"];

async function ModuleDetail({ params }: { params: Params }) {
  const { track, module } = await params;
  const data = await apiGet<ModuleDetailResponse>(
    `/api/tracks/${encodeURIComponent(track)}/modules/${encodeURIComponent(module)}/`,
  );
  if (!data) notFound();

  return (
    <>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/tracks" className="hover:underline">Tracks</Link>
        {" / "}
        <Link href={`/tracks/${data.track.slug}`} className="hover:underline">{data.track.title}</Link>
      </nav>
      <h1 className="text-3xl font-bold">{data.module.order}. {data.module.title}</h1>
      {data.module.description && <p className="mt-2 text-gray-600">{data.module.description}</p>}

      <div className="mt-8">
        <LessonList trackSlug={data.track.slug} moduleSlug={data.module.slug} lessons={data.lessons} />
      </div>
    </>
  );
}

export default function ModulePage({ params }: PageProps<"/tracks/[track]/[module]">) {
  return (
    <Suspense fallback={<p className="text-gray-500">Loading module…</p>}>
      <ModuleDetail params={params} />
    </Suspense>
  );
}
