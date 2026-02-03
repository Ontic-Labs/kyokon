import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kyokon.ai";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Kyokon — USDA FoodData Central Explorer",
    template: "%s | Kyokon",
  },
  description:
    "Search, browse, and explore 8,158 foods from the USDA FoodData Central database. SR Legacy and Foundation Foods with nutrients, portions, and cookability data.",
  keywords: [
    "food database",
    "nutrition API",
    "USDA FoodData Central",
    "nutrient data",
    "food ingredients",
    "recipe nutrition",
    "dietary data",
    "SR Legacy",
    "Foundation Foods",
  ],
  authors: [{ name: "Ontic Labs" }],
  creator: "Ontic Labs",
  publisher: "Ontic Labs",
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.svg",
  },
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    siteName: "Kyokon",
    title: "Kyokon — USDA FoodData Central Explorer",
    description:
      "Search, browse, and explore 8,158 foods from the USDA FoodData Central database. Nutrient data, portions, and cookability assessments.",
    images: [
      {
        url: "/og-image",
        width: 1200,
        height: 630,
        alt: "Kyokon — Recipe-first food & nutrition database",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kyokon — USDA FoodData Central Explorer",
    description:
      "Search, browse, and explore 8,158 foods from the USDA FoodData Central database.",
    creator: "@onticlabs",
    images: ["/og-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: BASE_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Kyokon",
    description:
      "Search, browse, and explore 8,158 foods from the USDA FoodData Central database with detailed nutrient information.",
    url: BASE_URL,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    creator: {
      "@type": "Organization",
      name: "Ontic Labs",
      url: "https://onticlabs.com",
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${BASE_URL}/foods?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans bg-surface text-text-primary antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
