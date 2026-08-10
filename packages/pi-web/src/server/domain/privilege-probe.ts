/**
 * R26 session-follow：特权 ctx 有效性探针（唯一 seam——纯函数，可单测）。
 *
 * TUI 手动切换会话后，/web 命令捕获的 ExtensionCommandContext 被内核 invalidate
 * （assertActive 抛 stale 错误）。探测方式：调用 command ctx 的轻量方法
 * getSystemPromptOptions()——成功 = 特权仍有效；抛错/null = 已降级。
 */
export function probePrivileged(priv: { getSystemPromptOptions(): unknown } | null): boolean {
  if (!priv) return false;
  try {
    priv.getSystemPromptOptions();
    return true;
  } catch {
    return false;
  }
}
