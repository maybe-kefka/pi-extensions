/**
 * git 状态标记（entities/files）：porcelain 状态 → 树条目后缀标记。
 */

/** 状态 → 显示字符（M/A/D/??/U） */
export function statusMarker(status: string): string {
  switch (status) {
    case "M":
      return "M";
    case "A":
      return "A";
    case "D":
      return "D";
    case "U":
      return "!";
    case "??":
      return "?";
    default:
      return "";
  }
}

/** 状态 → 语义色变量（随主题） */
export function statusColorVar(status: string): string {
  switch (status) {
    case "M":
      return "var(--chart-4)"; // 橙
    case "A":
      return "var(--success)"; // 绿
    case "D":
      return "var(--destructive)"; // 红
    case "U":
      return "var(--warning)"; // 黄
    default:
      return "var(--muted-foreground)"; // 灰（??）
  }
}
