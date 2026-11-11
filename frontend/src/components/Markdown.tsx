import type { ComponentProps, ElementType } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders lesson Markdown as React elements on the server.
// Safety comes from react-markdown's defaults: raw HTML in the Markdown is
// ignored (no rehype-raw), there is no dangerouslySetInnerHTML, and the
// default urlTransform drops javascript: and other unsafe URLs.

// react-markdown hands every component the Markdown AST in a `node` prop;
// drop it so it is neither spread onto the DOM nor serialized into the page.
function styled<T extends ElementType>(Tag: T, className: string) {
  function Styled({ node, ...props }: ComponentProps<T> & { node?: unknown }) {
    void node;
    const Element = Tag as ElementType;
    return <Element className={className} {...props} />;
  }
  Styled.displayName = `Markdown(${String(Tag)})`;
  return Styled;
}

const components: Components = {
  h1: styled("h1", "text-3xl font-bold"),
  h2: styled("h2", "text-2xl font-bold"),
  h3: styled("h3", "text-xl font-semibold"),
  a: ({ node, href, children, ...rest }) => {
    void node;
    const external = /^https?:\/\//.test(href ?? "");
    return (
      <a
        href={href}
        className="text-blue-600 underline"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        {...rest}
      >
        {children}
      </a>
    );
  },
  ul: styled("ul", "list-disc space-y-1 pl-6"),
  ol: styled("ol", "list-decimal space-y-1 pl-6"),
  blockquote: styled("blockquote", "border-l-4 border-gray-300 pl-4 text-gray-600"),
  pre: styled("pre", "overflow-x-auto rounded bg-gray-900 p-4 text-sm text-gray-100"),
  code: styled("code", "rounded bg-gray-100 px-1 font-mono text-sm [pre_&]:bg-transparent [pre_&]:p-0"),
  table: styled("table", "border-collapse text-sm"),
  th: styled("th", "border px-3 py-1 text-left font-semibold"),
  td: styled("td", "border px-3 py-1"),
};

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-4 leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
