import { NutrientInfo } from "@/types/fdc";
import DataTable, { Column } from "@/components/data-table";

interface NutrientTableProps {
  nutrients: NutrientInfo[];
}

const columns: Column<NutrientInfo>[] = [
  {
    key: "name",
    header: "Nutrient",
    cellClassName: "text-text-primary",
    render: (n) => n.name,
  },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    cellClassName: "text-text-primary font-mono",
    render: (n) =>
      n.amount.toLocaleString(undefined, { maximumFractionDigits: 3 }),
  },
  {
    key: "unit",
    header: "Unit",
    cellClassName: "text-text-muted",
    render: (n) => n.unit,
  },
];

export default function NutrientTable({ nutrients }: NutrientTableProps) {
  if (nutrients.length === 0) {
    return (
      <p className="text-text-muted text-sm">No nutrient data available.</p>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={nutrients}
      keyExtractor={(n) => n.nutrientId}
      striped
      maxHeightClass="max-h-[36rem]"
    />
  );
}
