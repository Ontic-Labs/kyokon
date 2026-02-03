import SwaggerUIWrapper from "@/components/swagger-ui-wrapper";
import { UI_STRINGS } from "@/constants/ui-strings";

export const metadata = {
  title: "API Documentation",
  description:
    "Interactive API documentation for Kyokon. Explore endpoints, try requests, and learn how to integrate USDA food data into your applications.",
  openGraph: {
    title: "API Documentation | Kyokon",
    description:
      "Interactive API documentation for the Kyokon food and nutrition API.",
    url: "/docs",
  },
  twitter: {
    card: "summary",
    title: "API Documentation | Kyokon",
    description:
      "Interactive API docs for Kyokon.",
  },
  alternates: {
    canonical: "/docs",
  },
};

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">
        {UI_STRINGS.docs.title}
      </h1>
      <p className="text-sm text-text-secondary">
        {UI_STRINGS.docs.description}
      </p>
      <SwaggerUIWrapper />
    </div>
  );
}
