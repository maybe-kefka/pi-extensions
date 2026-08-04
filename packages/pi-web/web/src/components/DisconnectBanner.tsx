export function DisconnectBanner({ conn }: { conn: "connecting" | "open" | "closed" }) {
  if (conn === "open") return null;
  return (
    <div className="bg-destructive/15 text-destructive border-b px-4 py-1.5 text-center text-xs">
      {conn === "connecting" ? "正在重连…" : "连接已断开，正在自动重连"}
    </div>
  );
}
