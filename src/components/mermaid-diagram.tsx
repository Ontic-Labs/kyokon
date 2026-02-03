"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  chart: string;
}

export default function MermaidDiagram({ chart }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const readToken = (name: string) =>
        getComputedStyle(document.documentElement)
          .getPropertyValue(name)
          .trim();
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        themeVariables: {
          primaryColor: readToken("--token-surface-elevated"),
          primaryTextColor: readToken("--token-text-primary"),
          primaryBorderColor: readToken("--token-border-strong"),
          lineColor: readToken("--token-interactive-primary"),
          secondaryColor: readToken("--token-surface-raised"),
          tertiaryColor: readToken("--token-surface"),
          fontFamily: "ui-monospace, monospace",
          fontSize: "14px",
        },
      });

      const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
      const { svg: rendered } = await mermaid.render(id, chart);
      if (!cancelled) setSvg(rendered);
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  return (
    <div
      ref={containerRef}
      className="my-4 flex justify-center overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
