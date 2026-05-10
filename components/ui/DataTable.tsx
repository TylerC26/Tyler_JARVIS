import type { ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  width?: string;
  render: (row: T) => ReactNode;
  className?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel?: string;
  emptyCta?: ReactNode;
  rowAction?: (row: T) => void;
  dense?: boolean;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyLabel = "// no records",
  emptyCta,
  rowAction,
  dense = false,
}: Props<T>) {
  if (rows.length === 0) {
    return (
      <div className="grid place-items-center rounded-sm border border-dashed border-edge px-4 py-10 text-center">
        <span className="font-mono text-[11px] text-fg-dim">{emptyLabel}</span>
        {emptyCta && <div className="mt-3">{emptyCta}</div>}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-sm border border-edge">
      <table className="w-full border-collapse font-mono text-xs">
        <thead className="bg-surface-2">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={[
                  "border-b border-edge px-3 py-2 text-[10px] uppercase tracking-wider text-fg-muted",
                  col.align === "right"
                    ? "text-right"
                    : col.align === "center"
                      ? "text-center"
                      : "text-left",
                  col.className ?? "",
                ].join(" ")}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={rowAction ? () => rowAction(row) : undefined}
              className={[
                "border-b border-edge/60 last:border-0",
                rowAction ? "cursor-pointer hover:bg-surface-2" : "",
              ].join(" ")}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={[
                    dense ? "px-3 py-1.5" : "px-3 py-2",
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                        ? "text-center"
                        : "text-left",
                    col.className ?? "",
                  ].join(" ")}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
