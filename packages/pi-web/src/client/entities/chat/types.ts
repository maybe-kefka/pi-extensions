/** 与服务端协议形状镜像的类型（SPEEC §4）。 */

export interface WebState {
  sessionFile: string | null;
  sessionId: string | null;
  sessionName: string | null;
  model: { provider: string; id: string; name: string | null } | null;
  thinkingLevel: string | null;
  availableThinkingLevels: string[];
  isStreaming: boolean;
  context: { tokens: number | null; contextWindow: number | null; percent: number | null };
  messageCount: number;
}

export interface SessionInfo {
  path: string;
  name: string | null;
  cwd: string;
  messageCount: number;
  firstMessage: string;
  modified: string;
}

export interface ModelInfo {
  provider: string;
  id: string;
  name: string;
}

export interface CommandInfo {
  name: string;
  description: string | null;
  source: string;
}

export interface HistoryMessage {
  role: string;
  text: string;
  thinking?: string;
  toolCalls?: { id: string; name: string; arguments: unknown; result?: string; isError?: boolean }[];
  userIndex?: number;
}

export interface SkillInfo {
  name: string;
  description: string | null;
}

export interface ListedFile {
  name: string;
  path: string;
  /** 是否目录条目（R17：@ 面板文件/文件夹平级展示） */
  isDir?: boolean;
}

export interface FileGroup {
  dir: string;
  files: ListedFile[];
}

/** pi:getContextBreakdown 返回（镜像后端 ContextBreakdown + usage） */
export interface ContextBreakdownData {
  categories: { key: string; label: string; tokens: number }[];
  conversation: { user: number; assistant: number; toolResult: number; other: number; total: number };
  total: number;
  usage: { tokens: number | null; contextWindow: number; percent: number | null } | null;
}

/** pi:getTree 返回的树节点（镜像 SessionTreeNode） */
export interface TreeNode {
  entry: {
    type: string;
    id: string;
    parentId: string | null;
    timestamp: string;
    message?: { role?: string; content?: unknown; toolName?: string };
    [k: string]: unknown;
  };
  children: TreeNode[];
  label?: string;
  /** R27：树深度超限被服务端截断（children 已清空） */
  truncated?: boolean;
  [k: string]: unknown;
}

/** pi:event notification params：{ type, ...fields } */
export interface PiEvent {
  type: string;
  [k: string]: unknown;
}

export interface RpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params: Record<string, unknown>;
}

export interface RpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface RpcNotification {
  jsonrpc: "2.0";
  method: "pi:event";
  params: PiEvent;
}
