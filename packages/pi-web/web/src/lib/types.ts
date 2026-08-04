/** 与服务端协议形状镜像的类型（SPEEC §4）。 */

export interface WebState {
  sessionFile: string | null;
  sessionId: string | null;
  sessionName: string | null;
  model: { provider: string; id: string; name: string | null } | null;
  thinkingLevel: string | null;
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
