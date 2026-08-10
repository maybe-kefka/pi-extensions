import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { AlertTriangle, FileLock2 } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { langForFile, type SupportedLang } from "@/entities/files/lang";
import type { OpenedFile } from "@/entities/files/editor";

function langExt(lang: SupportedLang | null) {
  switch (lang) {
    case "javascript":
      return javascript({ typescript: true, jsx: true });
    case "json":
      return json();
    case "css":
      return css();
    case "html":
      return html();
    case "markdown":
      return markdown();
    case "python":
      return python();
    default:
      return [];
  }
}

export interface EditorPaneProps {
  file: OpenedFile | null;
  /** Ticket 02 前恒只读；此后由 dirty/保存状态驱动 */
  readOnly?: boolean;
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function EditorPane({ file, readOnly = true }: EditorPaneProps) {
  if (!file) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        从左侧选择文件查看内容
      </div>
    );
  }
  const modeNote =
    file.mode === "binary" ? (
      <Badge variant="secondary">
        <FileLock2 className="mr-1 size-3" /> 二进制文件，不可编辑
      </Badge>
    ) : file.mode === "too-large" ? (
      <Badge variant="secondary">
        <AlertTriangle className="mr-1 size-3" /> 文件过大（{fmtSize(file.size)}），仅只读
      </Badge>
    ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="truncate font-mono text-xs">{file.path}</span>
        <span className="text-muted-foreground text-xs tabular-nums">{fmtSize(file.size)}</span>
        {modeNote}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {file.mode === "text" ? (
          <CodeMirror
            value={file.content}
            height="100%"
            style={{ height: "100%", fontSize: 13 }}
            extensions={[langExt(langForFile(file.name))]}
            readOnly={readOnly}
            basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: false }}
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            {file.mode === "binary" ? "二进制内容不可预览" : "文件过大，仅只读"}
          </div>
        )}
      </div>
    </div>
  );
}
