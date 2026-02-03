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
}

export default function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = "No data found.",
  striped = false,
  minWidthClass,
  rowClassName,
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
    <div className="bg-surface-raised border border-border-default rounded-md overflow-x-auto">
      <table className={`w-full text-sm ${minWidthClass ?? ""}`}>
        <thead>
          <tr className="border-b border-border-default bg-surface-inset">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-2 font-medium text-text-secondary ${alignClass(col.align)} ${col.width ?? ""} ${col.headerClassName ?? ""}`}
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
              className={`border-b border-border-default last:border-b-0 hover:bg-surface-inset transition-colors ${
                striped && index % 2 === 1 ? "bg-surface-inset/50" : ""
              } ${rowClassName ? rowClassName(item, index) : ""}`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-2 ${alignClass(col.align)} ${col.cellClassName ?? ""}`}
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
