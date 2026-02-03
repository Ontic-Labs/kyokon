import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-text-muted">
      <ol className="flex items-center gap-1.5">
        <li>
          <Link
            href="/"
            className="text-text-link hover:text-text-link-hover transition-colors"
          >
            Home
          </Link>
        </li>
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-border-strong">/</span>
            {item.href ? (
              <Link
                href={item.href}
                className="text-text-link hover:text-text-link-hover transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-text-secondary truncate max-w-64">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
