import type { Explanation, Segment } from "@/lib/python/errorExplanations";

function Text({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.code ? (
          <code key={index} className="rounded bg-white/80 px-1 font-mono text-[0.95em]">
            {segment.text}
          </code>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

// The plain-language box shown under the program output after a failed Run.
// The original traceback stays in the output above it, unchanged.
export default function ErrorExplanation({
  explanation,
  line,
  source,
}: {
  explanation: Explanation;
  line: number | null;
  source: string | null;
}) {
  return (
    <section
      aria-label="What this error means"
      data-explanation={explanation.id}
      className="mt-2 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-gray-900"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800">What this error means</h3>
      <p className="mt-1 text-base font-semibold">
        <Text segments={explanation.title} />
      </p>
      {line !== null && (
        <p className="mt-2">
          Line {line}
          {source?.trim() && (
            <>
              :{" "}
              <code className="whitespace-pre-wrap break-all rounded bg-white/80 px-1 font-mono">{source}</code>
            </>
          )}
        </p>
      )}
      <p className="mt-2">
        <Text segments={explanation.summary} />
      </p>
      {explanation.tips.length > 0 && (
        <>
          <p className="mt-3 font-medium">Things to check</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {explanation.tips.map((tip, index) => (
              <li key={index}>
                <Text segments={tip} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
