"use client";

interface HBarItem {
  label: string;
  value: number;
  displayValue: React.ReactNode;
  onClick?: () => void;
}

interface HorizontalBarChartProps {
  title: string;
  items: HBarItem[];
  color?: string;
  loading?: boolean;
  maxItems?: number;
}

export function HorizontalBarChart({
  title, items, color = "#3b82f6", loading, maxItems = 10,
}: HorizontalBarChartProps) {
  const displayed = items.slice(0, maxItems);
  const maxVal = Math.max(...displayed.map((i) => i.value), 1);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-card p-5 h-80 flex flex-col">
        <div className="skeleton h-4 w-40 mb-4" />
        <div className="flex-1 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="skeleton h-3 w-32" style={{ width: `${60 + i * 7}%` }} />
              <div className="skeleton h-1.5 rounded-full" style={{ width: `${90 - i * 12}%` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (displayed.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-card p-5 flex flex-col h-80">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">{title}</h3>
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          Sem dados para exibir
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-card p-5 flex flex-col">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">{title}</h3>
      <div className="flex-1 space-y-2.5 overflow-y-auto max-h-72 pr-1">
        {displayed.map((item, i) => (
          <div
            key={i}
            onClick={item.onClick}
            className={`group ${item.onClick ? "cursor-pointer" : ""}`}
            title={item.onClick ? `Filtrar por: ${item.label}` : undefined}
          >
            <div className="flex justify-between items-end mb-1 gap-3">
              <span
                className="text-xs font-medium text-slate-700 group-hover:text-slate-900 transition-colors truncate"
                title={item.label}
              >
                {item.label}
              </span>
              <span className="text-xs font-bold text-slate-800 shrink-0">{item.displayValue}</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(item.value / maxVal) * 100}%`,
                  backgroundColor: color,
                  opacity: item.onClick ? undefined : 0.8,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
