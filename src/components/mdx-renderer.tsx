import { MDXRemote } from "next-mdx-remote/rsc";
import type { ComponentPropsWithoutRef } from "react";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import MermaidDiagram from "@/components/mermaid-diagram";

interface Props {
  content: string;
}


export default function MdxRenderer({ content }: Props) {
  return (
    <MDXRemote
      source={content}
      options={{
        mdxOptions: {
          remarkPlugins: [remarkGfm, remarkMath],
          rehypePlugins: [rehypeKatex],
        },
      }}
      components={{
        // Style headings
        h1: ({ children }: ComponentPropsWithoutRef<"h1">) => (
          <h1 className="text-2xl font-bold text-text-primary mt-8 mb-4">
            {children}
          </h1>
        ),
        h2: ({ children }: ComponentPropsWithoutRef<"h2">) => (
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-3 border-b border-border-default pb-2">
            {children}
          </h2>
        ),
        h3: ({ children }: ComponentPropsWithoutRef<"h3">) => (
          <h3 className="text-lg font-semibold text-text-primary mt-6 mb-2">
            {children}
          </h3>
        ),
        h4: ({ children }: ComponentPropsWithoutRef<"h4">) => (
          <h4 className="text-base font-semibold text-text-primary mt-4 mb-2">
            {children}
          </h4>
        ),
        // Paragraphs
        p: ({ children }: ComponentPropsWithoutRef<"p">) => (
          <p className="text-text-secondary mb-4 leading-relaxed">{children}</p>
        ),
        // Links
        a: ({ href, children }: ComponentPropsWithoutRef<"a">) => (
          <a
            href={href}
            className="text-text-link hover:text-text-link-hover underline"
            target={href?.startsWith("http") ? "_blank" : undefined}
            rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
          >
            {children}
          </a>
        ),
        // Code blocks
        pre: ({ children }: ComponentPropsWithoutRef<"pre">) => {
          const child = Array.isArray(children) ? children[0] : children;
          if (
            child &&
            typeof child === "object" &&
            "props" in child &&
            child.props?.className === "language-mermaid"
          ) {
            return <>{children}</>;
          }
          return (
            <pre className="bg-surface-inset border border-border-default rounded-md p-4 overflow-x-auto mb-4 text-sm">
              {children}
            </pre>
          );
        },
        code: ({ className, children }: ComponentPropsWithoutRef<"code">) => {
          if (className === "language-mermaid") {
            const chart = String(children).replace(/\n$/, "");
            return <MermaidDiagram chart={chart} />;
          }
          const isInline = !className;
          if (isInline) {
            return (
              <code className="bg-surface-inset px-1.5 py-0.5 rounded text-sm font-mono text-text-primary">
                {children}
              </code>
            );
          }
          return <code className="font-mono text-text-primary">{children}</code>;
        },
        // Lists
        ul: ({ children }: ComponentPropsWithoutRef<"ul">) => (
          <ul className="list-disc list-inside mb-4 space-y-1 text-text-secondary">
            {children}
          </ul>
        ),
        ol: ({ children }: ComponentPropsWithoutRef<"ol">) => (
          <ol className="list-decimal list-inside mb-4 space-y-1 text-text-secondary">
            {children}
          </ol>
        ),
        li: ({ children }: ComponentPropsWithoutRef<"li">) => (
          <li className="leading-relaxed">{children}</li>
        ),
        // Blockquotes
        blockquote: ({ children }: ComponentPropsWithoutRef<"blockquote">) => (
          <blockquote className="border-l-4 border-accent-primary pl-4 italic text-text-muted mb-4">
            {children}
          </blockquote>
        ),
        // Tables
        table: ({ children }: ComponentPropsWithoutRef<"table">) => (
          <div className="bg-surface-raised border border-border-default rounded-md overflow-x-auto mb-4">
            <table className="w-full text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }: ComponentPropsWithoutRef<"thead">) => (
          <thead className="border-b border-border-default bg-surface-inset">
            {children}
          </thead>
        ),
        th: ({ children }: ComponentPropsWithoutRef<"th">) => (
          <th className="px-4 py-2 font-medium text-text-secondary text-left">
            {children}
          </th>
        ),
        td: ({ children }: ComponentPropsWithoutRef<"td">) => (
          <td className="px-4 py-2 text-text-secondary border-b border-border-default">
            {children}
          </td>
        ),
        // Horizontal rules
        hr: () => <hr className="border-border-default my-8" />,
        // Strong and emphasis
        strong: ({ children }: ComponentPropsWithoutRef<"strong">) => (
          <strong className="font-semibold text-text-primary">{children}</strong>
        ),
        em: ({ children }: ComponentPropsWithoutRef<"em">) => (
          <em className="italic">{children}</em>
        ),
      }}
    />
  );
}
