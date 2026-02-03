import { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  width?: string;
  render: (item: T, index: number) => ReactNode;
  /** Custom header renderer (for sortable headers, etc.) */
  renderHeader?: () => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string | number;
  emptyMessage?: string;
  striped?: boolean;
  minWidthClass?: string;
  rowClassName?: (item: T, index: number) => string;
  /** Cap the table height and scroll. e.g. "max-h-[32rem]" */
  maxHeightClass?: string;
}

export default function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = "No data found.",
  striped = true,
  minWidthClass,
  rowClassName,
  maxHeightClass,
}: DataTableProps<T>) {
  const alignClass = (align?: "left" | "right" | "center") => {
    switch (align) {
      case "right":
        return "text-right";
      case "center":
        return "text-center";
      default:
        return "text-left";
    }
  };

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted">{emptyMessage}</div>
    );
  }

  return (
    <div
      className={`bg-table-row-bg border border-table-border rounded-md overflow-auto ${maxHeightClass ?? ""}`}
    >
      <table className={`w-full text-sm ${minWidthClass ?? ""}`}>
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-table-border bg-table-header-bg">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-2.5 font-semibold text-xs uppercase tracking-wider text-table-header-text ${alignClass(col.align)} ${col.width ?? ""} ${col.headerClassName ?? ""}`}
              >
                {col.renderHeader ? col.renderHeader() : col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => (
            <tr
              key={keyExtractor(item, index)}
              className={`border-b border-table-border last:border-b-0 hover:bg-table-row-hover transition-colors ${
                striped && index % 2 === 1 ? "bg-table-row-alt-bg" : ""
              } ${rowClassName ? rowClassName(item, index) : ""}`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-2.5 ${alignClass(col.align)} ${col.cellClassName ?? ""}`}
                >
                  {col.render(item, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
