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
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        themeVariables: {
          primaryColor: "#1e1e2e",
          primaryTextColor: "#e4e4e7",
          primaryBorderColor: "#3f3f46",
          lineColor: "#6366f1",
          secondaryColor: "#18181b",
          tertiaryColor: "#27272a",
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
