"use client";

import { useEffect, useRef } from "react";

export default function RedocUI() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Dynamically load Redoc standalone bundle
    const script = document.createElement("script");
    script.src = "https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js";
    script.async = true;
    script.onload = () => {
      if (containerRef.current && (window as unknown as { Redoc: { init: (specUrl: string, options: Record<string, unknown>, container: HTMLElement) => void } }).Redoc) {
        (window as unknown as { Redoc: { init: (specUrl: string, options: Record<string, unknown>, container: HTMLElement) => void } }).Redoc.init(
          "/openapi.json",
          {
            scrollYOffset: 60,
            hideDownloadButton: false,
            expandResponses: "200",
            nativeScrollbars: true,
            hideRightPanel: true,
            theme: {
              breakpoints: {
                small: "50rem",
                medium: "75rem",
                large: "105rem",
              },
              colors: {
                primary: {
                  main: "#3b82f6",
                },
                text: {
                  primary: "#e5e5e5",
                  secondary: "#a3a3a3",
                },
                http: {
                  get: "#22c55e",
                  post: "#3b82f6",
                  put: "#eab308",
                  delete: "#ef4444",
                },
              },
              typography: {
                fontSize: "14px",
                fontFamily: "ui-sans-serif, system-ui, sans-serif",
                headings: {
                  fontFamily: "ui-sans-serif, system-ui, sans-serif",
                },
                code: {
                  fontSize: "13px",
                  fontFamily: "ui-monospace, monospace",
                },
              },
              sidebar: {
                backgroundColor: "#171717",
                textColor: "#e5e5e5",
                width: "260px",
              },
            },
          },
          containerRef.current
        );
      }
    };
    document.body.appendChild(script);

    return () => {
      // Cleanup script on unmount
      const existingScript = document.querySelector(
        'script[src*="redoc.standalone.js"]'
      );
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="min-h-[600px] rounded-lg overflow-hidden w-full"
      style={{ backgroundColor: "#1a1a1a" }}
    />
  );
}
