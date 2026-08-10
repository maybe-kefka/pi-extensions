import { diffStats, flattenDiff, type DiffHunkDto } from "@/entities/files/diff";

export interface DiffViewProps {
  hunks: DiffHunkDto[];
  isRepo: boolean;
}

/** 行级标记 diff 面板（unified）：add 绿 / del 红 / ctx 灰 / hunk 头蓝 */
export function DiffView({ hunks, isRepo }: DiffViewProps) {
  if (!isRepo) {
    return (
      <div className="text-muted-foreground px-3 py-1.5 text-xs">非 git 仓库，无 diff</div>
    );
  }
  if (hunks.length === 0) {
    return <div className="text-muted-foreground px-3 py-1.5 text-xs">无改动（与 HEAD 一致）</div>;
  }
  const stats = diffStats(hunks);
  return (
    <div className="border-b">
      <div className="flex items-center gap-2 px-3 py-1 text-xs">
        <span className="font-semibold">diff vs HEAD</span>
        <span style={{ color: "var(--success)" }}>+{stats.add}</span>
        <span style={{ color: "var(--destructive)" }}>-{stats.del}</span>
      </div>
      <div className="scrollbar-thin max-h-48 overflow-y-auto font-mono text-[11px] leading-5">
        {flattenDiff(hunks).map((row, i) => (
          <div
            key={i}
            className={row.kind === "hunk" ? "bg-primary/10 px-3" : "px-3"}
            style={
              row.kind === "add"
                ? { backgroundColor: "color-mix(in oklab, var(--success) 14%, transparent)" }
                : row.kind === "del"
                  ? { backgroundColor: "color-mix(in oklab, var(--destructive) 14%, transparent)" }
                  : undefined
            }
          >
            <span className="text-muted-foreground select-none">
              {row.kind === "hunk" ? "@@ " : row.kind === "add" ? "+ " : row.kind === "del" ? "- " : "  "}
            </span>
            {row.text}
          </div>
        ))}
      </div>
    </div>
  );
}
