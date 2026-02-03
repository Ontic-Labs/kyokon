"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
}

export default function MarkdownRenderer({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Style headings
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold text-text-primary mt-8 mb-4">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-3 border-b border-border-default pb-2">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-lg font-semibold text-text-primary mt-6 mb-2">
            {children}
          </h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-base font-semibold text-text-primary mt-4 mb-2">
            {children}
          </h4>
        ),
        // Paragraphs
        p: ({ children }) => (
          <p className="text-text-secondary mb-4 leading-relaxed">{children}</p>
        ),
        // Links
        a: ({ href, children }) => (
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
        pre: ({ children }) => (
          <pre className="bg-surface-inset border border-border-default rounded-md p-4 overflow-x-auto mb-4 text-sm">
            {children}
          </pre>
        ),
        code: ({ className, children }) => {
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
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-4 space-y-1 text-text-secondary">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-4 space-y-1 text-text-secondary">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-accent-primary pl-4 italic text-text-muted mb-4">
            {children}
          </blockquote>
        ),
        // Tables
        table: ({ children }) => (
          <div className="overflow-x-auto mb-4">
            <table className="w-full border border-border-default rounded-md text-sm">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-surface-inset">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-4 py-2 text-left font-medium text-text-primary border-b border-border-default">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-2 text-text-secondary border-b border-border-default">
            {children}
          </td>
        ),
        // Horizontal rules
        hr: () => <hr className="border-border-default my-8" />,
        // Strong and emphasis
        strong: ({ children }) => (
          <strong className="font-semibold text-text-primary">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
