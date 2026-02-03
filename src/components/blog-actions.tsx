"use client";

import { useMemo, useState } from "react";

interface Props {
  content: string;
}

function stripMarkdown(md: string): string {
  return md
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, "")
    // Remove inline code
    .replace(/`([^`]+)`/g, "$1")
    // Remove images
    .replace(/!\[[^\]]*\]\([^\)]*\)/g, "")
    // Replace links with text
    .replace(/\[([^\]]+)\]\([^\)]*\)/g, "$1")
    // Remove markdown headings
    .replace(/^#{1,6}\s+/gm, "")
    // Remove blockquote markers
    .replace(/^>\s?/gm, "")
    // Remove emphasis markers
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function BlogActions({ content }: Props) {
  const [copied, setCopied] = useState(false);

  const articleText = useMemo(() => stripMarkdown(content), [content]);

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const url = window.location.href;
    const year = new Date().getFullYear();
    const shareText = `${articleText}\n\n${url}\n© Kyokon ${year}`;

    if (navigator.share) {
      await navigator.share({ text: shareText });
      return;
    }

    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handlePrint}
        className="px-3 py-1.5 rounded-md border border-border-default text-text-secondary hover:text-text-primary hover:border-border-strong transition"
      >
        Print
      </button>
      <button
        type="button"
        onClick={handleShare}
        className="px-3 py-1.5 rounded-md border border-border-default text-text-secondary hover:text-text-primary hover:border-border-strong transition"
      >
        {copied ? "Copied" : "Share"}
      </button>
    </div>
  );
}
