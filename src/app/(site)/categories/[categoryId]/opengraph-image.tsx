import { ImageResponse } from "next/og";
import { getCategoryById } from "@/lib/data/categories";
import { searchFoods } from "@/lib/data/foods";

export const runtime = "edge";
export const alt = "Kyokon Category";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = await params;
  const category = await getCategoryById(Number(categoryId));

  if (!category) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0a0a",
            color: "white",
            fontSize: 48,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          Category not found
        </div>
      ),
      { ...size }
    );
  }

  const results = await searchFoods({
    categoryId: category.categoryId,
    page: 1,
    pageSize: 6,
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "60px 80px",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: 12,
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <ellipse cx="24" cy="28" rx="12" ry="16" fill="#7C3AED" />
            <ellipse cx="20" cy="24" rx="3" ry="6" fill="#A78BFA" opacity="0.5" />
            <path d="M24 12 C24 8, 28 6, 30 8 C32 10, 30 12, 28 12 L24 12" fill="#22C55E" />
            <path d="M24 12 C24 8, 20 6, 18 8 C16 10, 18 12, 20 12 L24 12" fill="#16A34A" />
            <ellipse cx="24" cy="13" rx="5" ry="2" fill="#15803D" />
          </svg>
          <span style={{ fontSize: 20, color: "#6366f1", fontWeight: 600 }}>
            Kyokon · Food Category
          </span>
        </div>

        {/* Category name */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: "white",
            lineHeight: 1.1,
            marginBottom: 8,
          }}
        >
          {category.name}
        </div>

        {/* Count */}
        <div style={{ fontSize: 22, color: "#a1a1aa", marginBottom: 40 }}>
          {results.total.toLocaleString()} foods in this category
        </div>

        {/* Sample foods */}
        {results.items.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              padding: "20px 28px",
              background: "#18181b",
              borderRadius: 8,
            }}
          >
            <span style={{ fontSize: 13, color: "#71717a", marginBottom: 6 }}>
              Sample foods
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 32px" }}>
              {results.items.map((f) => (
                <span
                  key={f.fdcId}
                  style={{ fontSize: 16, color: "#a1a1aa" }}
                >
                  {f.description.length > 50 ? f.description.slice(0, 47) + "..." : f.description}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    ),
    { ...size }
  );
}
