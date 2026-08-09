// @vitest-environment jsdom
import { FileText, Sparkles } from "lucide-react";

/**
 * R22：用户消息内容 → chip 渲染（纯函数 + 组件）。
 * skill XML 段（<skill name=...>）→ skill chip；文件路径（带扩展名）→ file chip；其余文本原样。
 */

export type UserSegment =
  | { type: "text"; text: string }
  | { type: "skill"; name: string }
  | { type: "file"; path: string };

/** 路径正则：相对路径（带扩展名，lookbehind 分隔符不进匹配）；排除 URL 与纯数字/小数 */
const PATH_RE = /(?<=^|[\s，。、])(?![\w.+-]+:\/\/)([\w./@~-]+\.\w{1,8})(?=$|[\s，。、])/;
/** skill XML 段：<skill name="..." location="...">\n...\n</skill> */
const SKILL_XML_RE = /<skill name="([^"]+)"[^>]*>[\s\S]*?<\/skill>/;

export function parseUserContent(text: string): UserSegment[] {
  const segments: UserSegment[] = [];
  let rest = text;
  while (rest.length > 0) {
    // 1) skill XML 段
    const sm = SKILL_XML_RE.exec(rest);
    const pathM = PATH_RE.exec(rest);
    const smIdx = sm ? sm.index : -1;
    const pathIdx = pathM ? pathM.index : -1;
    if (smIdx < 0 && pathIdx < 0) {
      segments.push({ type: "text", text: rest });
      break;
    }
    if (smIdx >= 0 && (pathIdx < 0 || smIdx < pathIdx)) {
      if (smIdx > 0) segments.push({ type: "text", text: rest.slice(0, smIdx) });
      segments.push({ type: "skill", name: sm![1] });
      rest = rest.slice(smIdx + sm![0].length);
      continue;
    }
    // 2) 路径段（前导分隔符已在文本段；尾部 lookahead 不含）
    if (pathIdx > 0) segments.push({ type: "text", text: rest.slice(0, pathIdx) });
    const path = pathM![1];
    if (/^\d+(\.\d+)?$/.test(path)) {
      segments.push({ type: "text", text: pathM![0] });
    } else {
      segments.push({ type: "file", path });
    }
    rest = rest.slice(pathIdx + pathM![0].length);
  }
  // 合并相邻文本段（数字等被排除路径后产生的碎片）
  const merged: UserSegment[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (seg.type === "text" && last && last.type === "text") last.text += seg.text;
    else merged.push(seg);
  }
  return merged;
}

const CHIP_STYLES = {
  skill: { icon: "✨", cls: "bg-purple-500/15 text-purple-400" },
  file: { icon: "📄", cls: "bg-sky-500/15 text-sky-400" },
} as const;

/** 用户气泡内容组件：chip 段渲染为与输入框同款 chip */
export function UserContentChip({ text }: { text: string }) {
  const segments = parseUserContent(text);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "skill" || seg.type === "file") {
          const style = CHIP_STYLES[seg.type];
          const label = seg.type === "skill" ? seg.name : seg.path;
          return (
            <span
              key={i}
              data-slot="user-chip"
              className={`${style.cls} mx-0.5 inline-flex cursor-default items-center gap-1 rounded-md px-1.5 py-0.5 align-middle text-xs font-medium whitespace-nowrap`}
            >
              {style.icon} {label}
            </span>
          );
        }
        return <span key={i} className="wrap-break-word whitespace-pre-wrap">{seg.text}</span>;
      })}
    </>
  );
}

export function renderUserContent(text: string): React.ReactNode {
  return <UserContentChip text={text} />;
}
