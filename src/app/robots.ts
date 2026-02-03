import { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kyokon.ai";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/openapi"],
        disallow: ["/admin/", "/api/"],
      },
      {
        userAgent: "GPTBot",
        allow: ["/", "/api/openapi"],
        disallow: ["/admin/", "/api/"],
      },
      {
        userAgent: "ChatGPT-User",
        allow: ["/", "/api/openapi"],
        disallow: ["/admin/", "/api/"],
      },
      {
        userAgent: "Claude-Web",
        allow: ["/", "/api/openapi"],
        disallow: ["/admin/", "/api/"],
      },
      {
        userAgent: "Anthropic-AI",
        allow: ["/", "/api/openapi"],
        disallow: ["/admin/", "/api/"],
      },
      {
        userAgent: "Google-Extended",
        allow: ["/", "/api/openapi"],
        disallow: ["/admin/", "/api/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
