import { useCallback, useEffect, useState } from "react";
import type { RpcClient } from "@/shared/api/rpc";
import type { DiffHunkDto } from "@/entities/files/diff";

export interface DiffSplitViewProps {
  path: string;
  request: RpcClient["request"];
  /** 所属仓库根（相对 cwd；diff 数据源在仓库上下文执行） */
  repoRoot?: string;
}

/** 只读 split diff（vscode diff editor 简化版）：左 HEAD / 右工作区，hunk 行对齐 */
export function DiffSplitView({ path, request, repoRoot }: DiffSplitViewProps) {
  const [head, setHead] = useState<string | null>(null);
  const [work, setWork] = useState<string | null>(null);
  const [hunks, setHunks] = useState<DiffHunkDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError(null);
      try {
        const [h, w, d] = await Promise.all([
          request<{ content: string }>("pi:gitShowHead", { path, ...(repoRoot !== undefined ? { repoRoot } : {}) }),
          request<{ content: string }>("pi:readFile", { path }),
          request<{ isRepo: boolean; diff: DiffHunkDto[] | null }>("pi:gitDiff", { path, ...(repoRoot !== undefined ? { repoRoot } : {}) }),
        ]);
        if (cancelled) return;
        setHead(h.content);
        setWork(w.content);
        setHunks(d.diff ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [path, request, repoRoot]);

  // hunk 行平铺（ctx 两侧 / del 左 / add 右）
  const rows: { left: { text: string; type: "ctx" | "del" } | null; right: { text: string; type: "ctx" | "add" } | null }[] = [];
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === "del") rows.push({ left: { text: line.text, type: "del" }, right: null });
      else if (line.type === "add") rows.push({ left: null, right: { text: line.text, type: "add" } });
      else rows.push({ left: { text: line.text, type: "ctx" }, right: { text: line.text, type: "ctx" } });
    }
  }

  if (error) {
    return (
      <div className="text-destructive flex h-full items-center justify-center p-6 text-xs">{error}</div>
    );
  }
  if (head === null || work === null) {
    return <div className="text-muted-foreground flex h-full items-center justify-center text-sm">加载中…</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="truncate font-mono text-xs">{path}</span>
        <span className="text-muted-foreground text-[11px]">diff vs HEAD（只读）</span>
        <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">左：HEAD</span>
        <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">右：工作区</span>
      </div>
      <div className="scrollbar-thin scrollbar-gutter-stable min-h-0 flex-1 overflow-auto">
        {rows.length === 0 && <div className="text-muted-foreground p-4 text-xs">无差异（与 HEAD 一致）</div>}
        <div className="min-w-max">
          {rows.map((row, i) => (
            <div key={i} className="flex min-w-max text-[11px] leading-5">
              <div
                className={`w-1/2 min-w-0 truncate whitespace-pre px-3 ${
                  row.left?.type === "del" ? "bg-destructive/15 text-destructive" : row.left?.type === "ctx" ? "text-muted-foreground" : ""
                }`}
                title={row.left?.type === "del" ? "左侧删除" : undefined}
              >
                {row.left ? row.left.text : ""}
              </div>
              <div
                className={`w-1/2 min-w-0 truncate whitespace-pre border-l px-3 ${
                  row.right?.type === "add" ? "bg-success/15 text-foreground" : row.right?.type === "ctx" ? "text-muted-foreground" : ""
                }`}
                title={row.right?.type === "add" ? "右侧新增" : undefined}
              >
                {row.right ? row.right.text : ""}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
