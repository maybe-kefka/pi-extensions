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
        <span className="text-green-600 dark:text-green-400">+{stats.add}</span>
        <span className="text-red-600 dark:text-red-400">-{stats.del}</span>
      </div>
      <div className="scrollbar-thin max-h-48 overflow-y-auto font-mono text-[11px] leading-5">
        {flattenDiff(hunks).map((row, i) => (
          <div
            key={i}
            className={
              row.kind === "hunk"
                ? "bg-primary/10 px-3"
                : row.kind === "add"
                  ? "bg-green-500/15 px-3"
                  : row.kind === "del"
                    ? "bg-red-500/15 px-3"
                    : "px-3"
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
