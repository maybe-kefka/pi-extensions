/**
 * diff 渲染模型（entities/files）：服务端 DiffHunk[] → 平铺渲染行（hunk 头 + 行标记）。
 */

export type DiffLineType = "add" | "del" | "ctx";

export interface DiffHunkDto {
  header: string;
  lines: { type: DiffLineType; text: string }[];
}

export type DiffRenderRow = { kind: "hunk"; text: string } | { kind: DiffLineType; text: string };

/** hunk 头/行 平铺（顺序保持）；空输入返回空数组 */
export function flattenDiff(hunks: DiffHunkDto[]): DiffRenderRow[] {
  const rows: DiffRenderRow[] = [];
  for (const hunk of hunks) {
    rows.push({ kind: "hunk", text: hunk.header });
    for (const line of hunk.lines) {
      rows.push({ kind: line.type, text: line.text });
    }
  }
  return rows;
}

/** 变更行统计（供面板徽标） */
export function diffStats(hunks: DiffHunkDto[]): { add: number; del: number } {
  let add = 0;
  let del = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add") add += 1;
      else if (line.type === "del") del += 1;
    }
  }
  return { add, del };
}
