import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState } from "react";
import { keymap } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import type { EditorView } from "@codemirror/view";
import { redo, undo } from "@codemirror/commands";
import { RotateCcw, Save, Undo2, Redo2 } from "lucide-react";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { AlertTriangle, FileLock2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui";
import { Button } from "@/shared/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui";
import type { RpcClient } from "@/shared/api";
import { langForFile, type SupportedLang } from "@/entities/files";
import { createEditorTheme } from "@/features/files";
import { isEditable, type OpenedFile } from "@/entities/files";
import {
  editContent,
  initialEditState,
  markConflict,
  markSaved,
  markSaving,
  reloadFromDisk,
  resolveConflictOverwrite,
  type EditState,
} from "@/entities/files";

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
  /** 编辑/保存状态变化上报（tab 条 dirty 圆点） */
  onDirtyChange?: (path: string, dirty: boolean) => void;
  /** 保存成功回调（git 状态联动刷新） */
  onSaved?: (path: string) => void;
}

export interface EditorPaneHandle {
  /** 显式保存（Ctrl+S / tab 条保存按钮）；返回成功与否 */
  save: () => Promise<boolean>;
}

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

export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(function EditorPane({ path, request, onDirtyChange, onSaved }, ref) {
  const [file, setFile] = useState<OpenedFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [edit, dispatch] = useReducer(reducer, EMPTY, initialEditState);
  const filePathRef = useRef<string | null>(null);

  const viewRef = useRef<EditorView | null>(null);
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

  // path 变化（tab 打开/切换实例）→ 加载文件
  useEffect(() => {
    if (path && path !== filePathRef.current) {
      filePathRef.current = path;
      void loadFile(path);
    }
  }, [path, loadFile]);

  const doSave = useCallback(
    async (state: EditState): Promise<boolean> => {
      if (!file) return false;
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
          onDirtyChange?.(file.path, false);
          onSaved?.(file.path);
          return true;
        } else if (r.reason === "conflict" && r.current) {
          dispatch({ kind: "conflict", hash: r.current.hash, mtimeMs: r.current.mtimeMs });
        } else {
          toast.error(`保存失败：${r.reason ?? "未知错误"}`);
          dispatch({ kind: "reload", file });
        }
      } catch (e) {
        toast.error(`保存失败：${e instanceof Error ? e.message : String(e)}`);
      }
      return false;
    },
    [file, request, onDirtyChange, onSaved],
  );

  // 显式保存：Ctrl+S（CodeMirror keymap）——闭包引用最新状态
  const stateRef = useRef({ doSave, edit });
  stateRef.current = { doSave, edit };
  const ctrlSKeymap = useMemo(
    () =>
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            const { doSave: save, edit: current } = stateRef.current;
            void save(current);
            return true;
          },
        },
      ]),
    [],
  );

  // 对外暴露 save（tab 条保存按钮 / 关闭三选）
  useImperativeHandle(ref, () => ({
    save: () => doSave(stateRef.current.edit),
  }));

  // 编辑 → 上报 dirty（仅状态变化时）
  useEffect(() => {
    onDirtyChange?.(path, edit.dirty);
  }, [edit.dirty, path, onDirtyChange]);

  // CodeMirror 扩展数组稳定（每次渲染重建会触发 reconfigure；无条件 hooks——须在条件 return 前）
  const extensions = useMemo(
    () => (file ? [langExt(langForFile(file.name)), createEditorTheme(), ctrlSKeymap] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [file?.name],
  );

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
        <div className="ml-auto flex items-center gap-0.5">
          <button
            className="hover:bg-muted text-muted-foreground hover:text-foreground flex size-6 cursor-pointer items-center justify-center rounded"
            title="撤销"
            onClick={() => viewRef.current && undo(viewRef.current)}
          >
            <Undo2 className="size-3.5" />
          </button>
          <button
            className="hover:bg-muted text-muted-foreground hover:text-foreground flex size-6 cursor-pointer items-center justify-center rounded"
            title="重做"
            onClick={() => viewRef.current && redo(viewRef.current)}
          >
            <Redo2 className="size-3.5" />
          </button>
          {edit.dirty && (
            <button
              className="bg-primary/10 text-primary hover:bg-primary/20 ml-1 flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs font-medium"
              onClick={() => void doSave(edit)}
              title="保存 (Ctrl+S)"
            >
              <Save className="size-3.5" />
              保存
            </button>
          )}
          <button
            className="hover:bg-muted text-muted-foreground hover:text-foreground flex size-6 cursor-pointer items-center justify-center rounded"
            title="重新加载（丢弃未保存改动）"
            onClick={() => {
              if (edit.dirty && !window.confirm("丢弃未保存的修改并从磁盘重新加载？")) return;
              void loadFile(path);
            }}
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {file.mode === "text" ? (
          <CodeMirror
            value={edit.content}
            theme="none"
            height="100%"
            style={{ height: "100%", fontSize: 13 }}
            extensions={extensions}
            onCreateEditor={(view) => {
              viewRef.current = view;
            }}
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
                // 放弃编辑：用本地已加载快照恢复（无网络请求）
                if (file) dispatch({ kind: "reload", file });
              }}
            >
              放弃编辑
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                // 重新加载：强制从磁盘重读（可能比本地快照更新）
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
});
