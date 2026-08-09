import { useMemo, useRef, useState } from "react";
import type * as React from "react";
import { Bot, ChevronDown, ChevronRight, CircleCheck, CircleX, GitFork, Loader2, User, Wrench } from "lucide-react";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Bubble, BubbleContent } from "@/shared/ui/bubble";
import { Markdown } from "@/shared/ui/markdown";
import { UserContentChip } from "@/features/chat-stream/user-content";
import { toolsForBubble } from "@/features/chat-stream/tools-for-bubble";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shared/ui/empty";
import { Message, MessageAvatar, MessageContent, MessageGroup, MessageHeader } from "@/shared/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/shared/ui/message-scroller";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import {
  bubbleStreaming,
  bubbleToolCallIds,
  type StreamAction,
  type StreamState,
  type ToolRow,
  type Turn,
  type TurnBubble,
  type TurnStep,
} from "@/entities/chat/stream";

function BotAvatar() {
  return (
    <Avatar className="size-7 sm:size-8">
      <AvatarFallback className="bg-muted text-foreground">
        <Bot className="size-4" />
      </AvatarFallback>
    </Avatar>
  );
}

function UserAvatar() {
  return (
    <Avatar className="size-7 sm:size-8">
      <AvatarFallback className="bg-muted text-foreground">
        <User className="size-4" />
      </AvatarFallback>
    </Avatar>
  );
}

type ToolStatus = "running" | "done" | "error";

function toolStatus(row: StreamState["tools"][number]): ToolStatus {
  if (!row.final) return "running";
  return row.isError ? "error" : "done";
}

function StatusIcon({ status }: { status: ToolStatus }) {
  if (status === "running") return <Loader2 className="text-muted-foreground size-3.5 animate-spin" />;
  if (status === "error") return <CircleX className="text-destructive size-3.5" />;
  return <CircleCheck className="text-success size-3.5" />;
}

/**
 * ToolNode 卡片（R18）：摘要行（状态图标 + 工具名 + 输出预览截断）+ 点击**就地展开** args/output。
 * 气泡流式区与 progress 弹窗共用；展开区不设 max-h/overflow（弹窗总体单 scroll）。
 */
function ToolCard({ row }: { row: StreamState["tools"][number] }) {
  const [open, setOpen] = useState(false);
  const status = toolStatus(row);
  // R23 F3：args 序列化按 row.args 引用 memo（工具流式 output 每 delta 更新时 row 引用变，但 args 未变 → 不重算）
  const argsJson = useMemo(
    () => (row.args === null || row.args === undefined ? "" : JSON.stringify(row.args)),
    [row.args],
  );
  const argsJsonPretty = useMemo(
    () => (row.args === null || row.args === undefined ? "" : JSON.stringify(row.args, null, 2)),
    [row.args],
  );
  // R23 F3：折叠态 preview 截断（不渲染完整 args JSON 到 DOM）；展开区完整 JSON 惰性（仅 open）
  const preview =
    row.output.trim() ||
    (argsJson ? (argsJson.length > 120 ? argsJson.slice(0, 120) + "…" : argsJson) : "");
  return (
    <div className="flex flex-col gap-1" data-slot="step-tool">
      <button
        type="button"
        data-slot="tool-toggle"
        className="border-border bg-muted/30 hover:bg-muted/50 flex w-full cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
        <StatusIcon status={status} />
        <span className="shrink-0 font-medium">{row.toolName}</span>
        {preview && <span className="text-muted-foreground min-w-0 flex-1 truncate">{preview}</span>}
      </button>
      {open && (
        <div className="border-border bg-muted/30 flex flex-col gap-1 rounded-xl border p-2">
          {row.args !== null && row.args !== undefined && (
            <div className="min-w-0">
              <div className="text-muted-foreground mb-0.5 text-[11px]">参数</div>
              <pre className="text-muted-foreground border-border rounded-md border p-2 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">
                {argsJsonPretty}
              </pre>
            </div>
          )}
          <div className="min-w-0">
            <div className="text-muted-foreground mb-0.5 text-[11px]">输出</div>
            <pre className="text-muted-foreground border-border rounded-md border p-2 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">
              {row.output || "(空)"}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/** 单个 reasoning 折叠块（R18：折叠显示 "reasoning" 标签，点击就地展开全文） */
function ReasoningBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1" data-slot="step-reasoning">
      <button
        type="button"
        className="text-muted-foreground hover:bg-muted/50 flex w-fit cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        reasoning
      </button>
      {open && (
        <pre className="text-muted-foreground bg-muted/30 border-border rounded-md border p-2 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">
          {text}
        </pre>
      )}
    </div>
  );
}

/**
 * 流式过程区（R18 langgraph 模型）：当前活跃轮（LLMNode）的 steps 按序实时渲染——
 * thinking 块灰色小字全文、text 块 Markdown 流式 + ▍、tool 块 ToolNode 卡片。
 * R20：active=false 时（过渡期显示上一轮 / 终态工具轮）不渲染 ▍ 光标。
 */
function StreamingSteps({
  turn,
  tools,
  active = true,
  processing = false,
}: {
  turn: Turn;
  tools: StreamState["tools"];
  active?: boolean;
  /** R24：工具结果窗口期——thinking 块由顶部指示器显示（避免重复） */
  processing?: boolean;
}) {
  const rows = new Map<string, StreamState["tools"][number]>();
  for (const t of tools) rows.set(t.toolCallId, t);
  const steps = turn.steps;
  const lastTextIdx = steps.reduce((acc, st, i) => (st.type === "text" ? i : acc), -1);
  return (
    <div className="flex flex-col gap-1.5" data-slot="streaming-steps">
      {steps.length === 0 && turn.text.trim() && (
        <span className="wrap-break-word whitespace-pre-wrap">{turn.text}</span>
      )}
      {/* R22：turn_start 空 turn（LLM 工作中）→ ▍ 光标 */}
      {steps.length === 0 && !turn.text.trim() && active && (
        <span data-slot="working-caret" className="animate-pulse">▍</span>
      )}
      {steps.map((st, i) => {
        if (st.type === "thinking") {
          return st.text.trim() && !processing ? (
            <div
              key={i}
              data-slot="step-thinking"
              className="text-muted-foreground scrollbar-thin max-h-16 overflow-y-auto text-xs"
            >
              {st.text}
            </div>
          ) : null;
        }
        if (st.type === "tool") {
          const row = rows.get(st.toolCallId);
          if (!row) return null;
          return <ToolCard key={i} row={row} />;
        }
        // text 块：R23 F1——流式中（active）轻量纯文本渲染（避免每 delta 全量 ReactMarkdown 解析）；
        // 终态/过渡轮（active=false）保持 Markdown。▍ 光标仅活跃轮最后 text 块。
        const caret = active && i === lastTextIdx && <span className="animate-pulse">▍</span>;
        if (active) {
          return (
            <div key={i} data-slot="step-text">
              <span className="wrap-break-word whitespace-pre-wrap">{st.text}</span>
              {caret}
            </div>
          );
        }
        return (
          <div key={i} data-slot="step-text">
            <Markdown text={st.text} />
            {caret}
          </div>
        );
      })}
    </div>
  );
}

/**
 * progress 弹窗（R18）：单 scroll 完整 ReAct 流。
 * 数据源 Turn.steps（按 turn 顺序，turn 内 steps 交错）：content 正常展示（Markdown）、
 * reasoning 折叠（"reasoning" 标签）、tool 折叠（摘要行）——全部就地展开；
 * 跳过最后一个 turn 的最后一个 text 块（最终回复在气泡里）。总体单 scroll，无嵌套。
 */
function ProgressDialog({
  bubble,
  tools,
  open,
  onOpenChange,
}: {
  bubble: TurnBubble;
  tools: StreamState["tools"];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const entries = useMemo(() => {
    const out: { turnIndex: number; step: TurnStep }[] = [];
    bubble.turns.forEach((turn, ti) => {
      const isLastTurn = ti === bubble.turns.length - 1;
      turn.steps.forEach((st, si) => {
        // 仅终态（最后 turn 已 final）跳过最后 text 块（最终回复在气泡里）；
        // 流式中实时展示完整流程（R20）
        if (isLastTurn && turn.final && si === turn.steps.length - 1 && st.type === "text") return;
        out.push({ turnIndex: ti, step: st });
      });
    });
    return out;
  }, [bubble]);
  const rows = new Map<string, StreamState["tools"][number]>();
  for (const t of tools) rows.set(t.toolCallId, t);
  const toolCount = bubbleToolCallIds(bubble).length;
  const [openReasoning, setOpenReasoning] = useState<Set<number>>(new Set());
  const [openTools, setOpenTools] = useState<Set<number>>(new Set());
  const toggle = (set: Set<number>, i: number, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(i);
    else next.delete(i);
    return next;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">⏱ 执行流程</DialogTitle>
          <DialogDescription>
            本轮完整 reasoning + Action 流程（{bubble.turns.length} 轮 · {toolCount} 次工具调用）
          </DialogDescription>
        </DialogHeader>
        {/* 总体单 scroll：外层一个 overflow-y-auto，内部不嵌套任何二级 scroll */}
        <div className="scrollbar-thin scrollbar-gutter-stable flex max-h-[60vh] flex-col gap-3 overflow-y-auto" data-slot="progress-scroll">
          {entries.length === 0 && <div className="text-muted-foreground p-2 text-xs">（本气泡无思考与工具记录）</div>}
          {entries.map((e, i) => {
            const st = e.step;
            if (st.type === "text") {
              return (
                <div key={i} data-slot="progress-content" className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground text-[11px]">第 {e.turnIndex + 1} 轮 · 内容</span>
                  <Markdown text={st.text} />
                </div>
              );
            }
            if (st.type === "thinking") {
              return (
                <div key={i} data-slot="progress-reasoning">
                  <span className="text-muted-foreground text-[11px]">第 {e.turnIndex + 1} 轮 · 思考</span>
                  <ReasoningBlock text={st.text} />
                </div>
              );
            }
            const row = rows.get(st.toolCallId);
            return (
              <div key={i} data-slot="progress-tool">
                <span className="text-muted-foreground text-[11px]">第 {e.turnIndex + 1} 轮 · 工具</span>
                {row ? <ToolCard row={row} /> : <div className="text-muted-foreground text-xs">{st.toolCallId}</div>}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 轮次聚合气泡（SPEC §7）：user 消息开气泡，后续 assistant turns 聚合
 * R23 F2：rows 为 per-bubble 工具行（引用稳定缓存），配合 Compiler props 比较隔离历史气泡 */
function TurnBubbleView({
  bubble,
  rows,
  onFork,
  processing,
}: {
  bubble: TurnBubble;
  rows: ToolRow[];
  onFork: (userIndex: number) => void;
  /** R24：工具结果窗口期文本（仅最后一个气泡非 null）；null = 非窗口期 */
  processing: string | null;
}) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const hasUser = bubble.userIndex >= 0;
  const streaming = bubbleStreaming(bubble);
  const activeTurn = streaming ? bubble.turns[bubble.turns.length - 1] : null;
  const finalTurn = !streaming ? bubble.turns[bubble.turns.length - 1] : null;
  // R20：新轮 steps 为空（活跃轮刚开始）→ 显示最后一个有内容的 turn（无空白帧）；
  // 活跃轮有内容后原子切换。
  const visibleTurn = (() => {
    if (activeTurn && (activeTurn.steps.length > 0 || activeTurn.text.trim())) return activeTurn;
    if (!streaming) return null;
    for (let i = bubble.turns.length - 2; i >= 0; i--) {
      const t = bubble.turns[i];
      if (t.steps.length > 0 || t.text.trim()) return t;
    }
    // R22：无上一轮内容（turn_start 首轮，LLM 刚开始工作）→ 显示空 turn（▍ 光标）
    return activeTurn ?? null;
  })();
  // R20：工具栏 per-bubble 独立——已完成气泡 fork+progress 常驻；
  // 活跃气泡只显示 progress（实时看当前大 Turn 流程），fork 仅完成态出现。
  const showFullToolbar = hasUser && !streaming;
  const showProgressOnly = hasUser && streaming;

  return (
    <>
      {hasUser && (
        <Message align="end">
          <MessageAvatar>
            <UserAvatar />
          </MessageAvatar>
          <MessageContent>
            <Bubble variant="default" align="end">
              <BubbleContent>
                {bubble.userFinal && bubble.userText.trim() ? (
                  <UserContentChip text={bubble.userText} />
                ) : (
                  <>
                    <UserContentChip text={bubble.userText} />
                    {!bubble.userText && <span className="animate-pulse">▍</span>}
                  </>
                )}
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      )}
      {bubble.turns.length > 0 && (
        <Message align="start">
          <MessageAvatar>
            <BotAvatar />
          </MessageAvatar>
          <MessageContent>
            <Bubble variant="outline" className="w-full">
              {/* R24：工具结果窗口期指示器（LLM 处理工具结果中）——气泡内容区第一行，与头像齐平 */}
              {processing !== null && (
                <div
                  data-slot="tool-processing"
                  className="text-muted-foreground flex items-center gap-1.5 text-xs"
                >
                  <Loader2 className="size-3 shrink-0 animate-spin" />
                  <span className="min-w-0 truncate">{processing || "thinking......"}</span>
                </div>
              )}
              {/* R18：流式中显示当前活跃轮；终态只留最终回复文本。
                  R20：活跃轮无内容时延续显示上一轮（无空白）；终态工具轮（无最终文本）显示步骤内容 */}
              {activeTurn ? (
                visibleTurn ? <StreamingSteps turn={visibleTurn} tools={rows} active={visibleTurn === activeTurn} processing={processing !== null} /> : null
              ) : finalTurn && finalTurn.text.trim() ? (
                <Markdown text={finalTurn.text} />
              ) : finalTurn && finalTurn.steps.length > 0 ? (
                <StreamingSteps turn={finalTurn} tools={rows} active={false} processing={processing !== null} />
              ) : null}
            </Bubble>
            {showFullToolbar && (
              <div className="flex items-center gap-1 pt-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground h-6 cursor-pointer px-2 text-[11px]"
                      onClick={() => onFork(bubble.userIndex)}
                    >
                      <GitFork data-icon="inline-start" className="size-3" />
                      fork
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>从此轮分叉新会话</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground h-6 cursor-pointer px-2 text-[11px]"
                      onClick={() => setTimelineOpen(true)}
                    >
                      <Wrench data-icon="inline-start" className="size-3" />
                      progress
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>查看完整 reasoning + Action 流程</TooltipContent>
                </Tooltip>
              </div>
            )}
            {showProgressOnly && (
              <div className="flex items-center gap-1 pt-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground h-6 cursor-pointer px-2 text-[11px]"
                      onClick={() => setTimelineOpen(true)}
                    >
                      <Wrench data-icon="inline-start" className="size-3" />
                      progress
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>查看完整 reasoning + Action 流程</TooltipContent>
                </Tooltip>
              </div>
            )}
          </MessageContent>
        </Message>
      )}

      <ProgressDialog bubble={bubble} tools={rows} open={timelineOpen} onOpenChange={setTimelineOpen} />
    </>
  );
}

const REASON_LABELS: Record<string, string> = {
  manual: "手动",
  threshold: "阈值",
  overflow: "溢出恢复",
};

function reasonLabel(reason: string | null): string {
  return (reason && REASON_LABELS[reason]) || reason || "未知";
}

export function Chat({
  state,
  dispatch,
  onFork,
}: {
  state: StreamState;
  dispatch: React.Dispatch<StreamAction>;
  onFork: (userIndex: number) => void;
}) {
  const hasContent = state.bubbles.length > 0 || state.tools.length > 0;
  const compacting = state.compacting;
  // R23 F2：per-bubble 工具行引用稳定缓存（toolsForBubble）——工具流式时历史气泡不重渲染
  const rowsCacheRef = useRef(new Map<string, ToolRow[]>());

  return (
    <main className="relative min-w-0 flex-1">
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-3 px-4 pt-3 pb-[25vh]">
              {!hasContent ? (
                <Empty className="mt-16">
                  <EmptyHeader>
                    <EmptyTitle className="text-sm font-medium">暂无消息</EmptyTitle>
                    <EmptyDescription>
                      {state.conn === "open" ? "发送第一条消息开始" : "等待连接…"}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <>
                  {state.bubbles.map((b, idx) => (
                    <MessageScrollerItem
                      key={b.id}
                      messageId={b.id}
                      scrollAnchor={b.userIndex >= 0}
                    >
                      <MessageGroup>
                        <TurnBubbleView
                          bubble={b}
                          rows={toolsForBubble(b, state.tools, rowsCacheRef.current)}
                          onFork={onFork}
                          processing={idx === state.bubbles.length - 1 ? state.processingToolResult : null}
                        />
                      </MessageGroup>
                    </MessageScrollerItem>
                  ))}
                  {/* R21：compact 系统记录（聊天流末尾；before 转圈 / done 完成文案，不持久） */}
                  {compacting && (compacting.phase === "before" || compacting.phase === "done") && (
                    <div
                      data-slot="compact-record"
                      className="text-muted-foreground flex justify-center py-1"
                    >
                      <span className="bg-muted/40 border-border rounded-full border px-3 py-1 text-[11px]">
                        {compacting.phase === "before" ? (
                          <span className="flex items-center gap-1.5">
                            <Loader2 data-slot="compact-spinner" className="size-3 animate-spin" />
                            正在压缩上下文…（{reasonLabel(compacting.reason)}）
                          </span>
                        ) : (
                          <>
                            上下文已压缩（{reasonLabel(compacting.reason)}）
                            {compacting.willRetry && " · 将重试上一条消息"}
                          </>
                        )}
                      </span>
                    </div>
                  )}
                </>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
    </main>
  );
}
