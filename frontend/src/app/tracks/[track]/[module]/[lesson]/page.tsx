import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import ExerciseWorkspace from "@/components/editor/ExerciseWorkspace";
import Markdown from "@/components/Markdown";
import { apiGet, type LessonDetailResponse, type LessonLink } from "@/lib/learning";

type Params = PageProps<"/tracks/[track]/[module]/[lesson]">["params"];

function LockedNotice({ lessonPath }: { lessonPath: string }) {
  const next = `?next=${encodeURIComponent(lessonPath)}`;
  return (
    <div className="mt-8 rounded-lg border bg-gray-50 p-6 text-center">
      <p className="text-lg font-medium">This lesson is for members.</p>
      <p className="mt-1 text-gray-600">
        Create a free account or log in to read it — you&apos;ll come right back here.
      </p>
      <div className="mt-4 flex justify-center gap-3">
        <Link href={`/signup${next}`} className="rounded bg-blue-600 px-4 py-2 font-medium text-white">
          Sign up
        </Link>
        <Link href={`/login${next}`} className="rounded border px-4 py-2 font-medium">
          Log in
        </Link>
      </div>
    </div>
  );
}

function NeighbourLink({
  trackSlug,
  link,
  direction,
}: {
  trackSlug: string;
  link: LessonLink;
  direction: "previous" | "next";
}) {
  if (!link) return <span />;
  return (
    <Link
      href={`/tracks/${trackSlug}/${link.module}/${link.lesson}`}
      className="text-sm text-blue-600 hover:underline"
    >
      {direction === "previous" ? `← ${link.title}` : `${link.title} →`}
    </Link>
  );
}

async function LessonDetail({ params }: { params: Params }) {
  const { track, module, lesson } = await params;
  const data = await apiGet<LessonDetailResponse>(
    `/api/tracks/${encodeURIComponent(track)}/modules/${encodeURIComponent(module)}` +
      `/lessons/${encodeURIComponent(lesson)}/`,
  );
  if (!data) notFound();

  const lessonPath = `/tracks/${data.track.slug}/${data.module.slug}/${data.lesson.slug}`;

  return (
    <>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/tracks" className="hover:underline">Tracks</Link>
        {" / "}
        <Link href={`/tracks/${data.track.slug}`} className="hover:underline">{data.track.title}</Link>
        {" / "}
        <Link href={`/tracks/${data.track.slug}/${data.module.slug}`} className="hover:underline">
          {data.module.title}
        </Link>
      </nav>

      <h1 className="text-3xl font-bold">{data.lesson.title}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {data.lesson.lesson_type} · about {data.lesson.estimated_minutes} min
        {data.lesson.is_sample && " · free sample"}
      </p>

      {data.lesson.locked ? (
        <LockedNotice lessonPath={lessonPath} />
      ) : (
        <>
          <article className="mt-8">
            <Markdown>{data.lesson.body ?? ""}</Markdown>
          </article>

          {data.lesson.exercises && data.lesson.exercises.length > 0 && (
            <ExerciseWorkspace
              // Separate drafts for every lesson.
              key={lessonPath}
              lessonPath={lessonPath}
              exercises={data.lesson.exercises.map((exercise) => ({
                slug: exercise.slug,
                title: exercise.title,
                starter_code: exercise.starter_code,
                visible_tests: exercise.visible_tests,
                instructions: <Markdown>{exercise.instructions}</Markdown>,
              }))}
            />
          )}
        </>
      )}

      <nav className="mt-10 flex items-center justify-between border-t pt-4">
        <NeighbourLink trackSlug={data.track.slug} link={data.previous} direction="previous" />
        <NeighbourLink trackSlug={data.track.slug} link={data.next} direction="next" />
      </nav>
    </>
  );
}

export default function LessonPage({ params }: PageProps<"/tracks/[track]/[module]/[lesson]">) {
  return (
    <Suspense fallback={<p className="text-gray-500">Loading lesson…</p>}>
      <LessonDetail params={params} />
    </Suspense>
  );
}
