import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { AlertTriangle, FileLock2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import type { RpcClient } from "@/shared/api/rpc";
import { langForFile, type SupportedLang } from "@/entities/files/lang";
import { createEditorTheme } from "@/entities/files/editor-theme";
import { isEditable, type OpenedFile } from "@/entities/files/editor";
import type { DiffHunkDto } from "@/entities/files/diff";
import {
  editContent,
  initialEditState,
  markConflict,
  markSaved,
  markSaving,
  reloadFromDisk,
  resolveConflictOverwrite,
  type EditState,
} from "@/entities/files/save-state";
import { DiffView } from "./DiffView";

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
  /** 文件相对路径（tab 迭代后由父级传 path，EditorPane 自行加载） */
  path: string;
  request: RpcClient["request"];
}

/** 防抖保存间隔（ms） */
const SAVE_DEBOUNCE_MS = 800;

type SaveAction =
  | { kind: "content"; content: string }
  | { kind: "saving" }
  | { kind: "saved"; hash: string; mtimeMs: number }
  | { kind: "conflict"; hash: string; mtimeMs: number }
  | { kind: "reload"; file: OpenedFile }
  | { kind: "dismiss" };

function reducer(state: EditState, action: SaveAction): EditState {
  switch (action.kind) {
    case "content":
      return editContent(state, action.content);
    case "saving":
      return markSaving(state);
    case "saved":
      return markSaved(state, { hash: action.hash, mtimeMs: action.mtimeMs });
    case "conflict":
      return markConflict(state, { hash: action.hash, mtimeMs: action.mtimeMs });
    case "reload":
      return reloadFromDisk(state, action.file);
    case "dismiss":
      return { ...state, conflict: null };
  }
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const EMPTY: OpenedFile = { path: "", name: "", content: "", mode: "text", size: 0, mtimeMs: 0, hash: "" };

export function EditorPane({ path, request }: EditorPaneProps) {
  const [file, setFile] = useState<OpenedFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [edit, dispatch] = useReducer(reducer, EMPTY, initialEditState);
  const [diff, setDiff] = useState<{ isRepo: boolean; hunks: DiffHunkDto[] } | null>(null);
  const filePathRef = useRef<string | null>(null);

  const loadFile = useCallback(
    async (p: string) => {
      try {
        const r = await request<Omit<OpenedFile, "path" | "name">>("pi:readFile", { path: p });
        const opened: OpenedFile = { path: p, name: p.split("/").pop() ?? p, ...r };
        setFile(opened);
        setLoadError(null);
        dispatch({ kind: "reload", file: opened });
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
        setFile(null);
      }
    },
    [request],
  );

  const loadDiff = useCallback(
    async (path: string) => {
      try {
        const r = await request<{ isRepo: boolean; diff: DiffHunkDto[] | null }>("pi:gitDiff", { path });
        setDiff({ isRepo: r.isRepo, hunks: r.diff ?? [] });
      } catch {
        setDiff({ isRepo: false, hunks: [] });
      }
    },
    [request],
  );

  // path 变化（tab 打开/切换实例）→ 加载文件 + diff
  useEffect(() => {
    if (path && path !== filePathRef.current) {
      filePathRef.current = path;
      void loadFile(path);
      void loadDiff(path);
    }
  }, [path, loadFile, loadDiff]);

  const doSave = useCallback(
    async (state: EditState) => {
      if (!file) return;
      dispatch({ kind: "saving" });
      try {
        const r = await request<{ ok: boolean; reason?: string; current?: { hash: string; mtimeMs: number } }>("pi:writeFile", {
          path: file.path,
          content: state.content,
          expectedHash: state.savedHash,
          expectedMtimeMs: state.savedMtimeMs,
        });
        if (r.ok) {
          // 磁盘已更新：重读快照（新 hash/mtime），供下次保存与 diff 刷新使用
          const fresh = await request<{ hash: string; mtimeMs: number; content: string; mode: string; size: number }>("pi:readFile", {
            path: file.path,
          });
          dispatch({ kind: "saved", hash: fresh.hash, mtimeMs: fresh.mtimeMs });
          const nextFile: OpenedFile = { ...file, hash: fresh.hash, mtimeMs: fresh.mtimeMs, content: state.content };
          setFile(nextFile);
          void loadDiff(file.path); // 保存后刷新 diff
        } else if (r.reason === "conflict" && r.current) {
          dispatch({ kind: "conflict", hash: r.current.hash, mtimeMs: r.current.mtimeMs });
        } else {
          toast.error(`保存失败：${r.reason ?? "未知错误"}`);
          dispatch({ kind: "reload", file });
        }
      } catch (e) {
        toast.error(`保存失败：${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [file, request],
  );

  // 防抖自动保存：dirty 且非保存中 → 800ms 后保存
  useEffect(() => {
    if (!edit.dirty || edit.saving) return;
    const t = setTimeout(() => void doSave(edit), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [edit, doSave]);

  const reloadFromDisk = useCallback(async () => {
    if (!file) return;
    try {
      const r = await request<OpenedFile>("pi:readFile", { path: file.path });
      const next: OpenedFile = { ...file, ...r };
      dispatch({ kind: "reload", file: next });
      setFile(next);
    } catch (e) {
      toast.error(`重新加载失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [file, request]);

  if (!file) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        {loadError ?? "加载中…"}
      </div>
    );
  }

  const editable = isEditable(file.mode);
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
        {edit.dirty && <span className="text-primary">●</span>}
        <span className="truncate font-mono text-xs">{file.path}</span>
        <span className="text-muted-foreground text-xs tabular-nums">{fmtSize(file.size)}</span>
        {edit.saving && <Badge variant="secondary">保存中…</Badge>}
        {modeNote}
      </div>
      {diff && <DiffView hunks={diff.hunks} isRepo={diff.isRepo} />}
      <div className="min-h-0 flex-1 overflow-hidden">
        {file.mode === "text" ? (
          <CodeMirror
            value={edit.content}
            theme="none"
            height="100%"
            style={{ height: "100%", fontSize: 13 }}
            extensions={[langExt(langForFile(file.name)), createEditorTheme()]}
            readOnly={!editable}
            onChange={(v) => dispatch({ kind: "content", content: v })}
            basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: false }}
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            {file.mode === "binary" ? "二进制内容不可预览" : "文件过大，仅只读"}
          </div>
        )}
      </div>
      <Dialog
        open={edit.conflict !== null}
        onOpenChange={(open) => {
          if (!open) dispatch({ kind: "dismiss" });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>文件已被外部修改</DialogTitle>
            <DialogDescription>
              磁盘上的内容与打开时不同（可能是 pi 会话或其它工具改的）。请选择如何处理你的编辑：
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                void reloadFromDisk();
              }}
            >
              放弃编辑
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void reloadFromDisk();
              }}
            >
              重新加载
            </Button>
            <Button
              onClick={() => {
                if (edit.conflict) {
                  const s = resolveConflictOverwrite(edit);
                  void doSave(s);
                }
              }}
            >
              覆盖保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
