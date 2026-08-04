/* pi web console — vanilla client, zero dependencies */
"use strict";

const $ = (id) => document.getElementById(id);

const chatEl = $("chat");
const connEl = $("conn");
const inputEl = $("input");
const busyHintEl = $("busy-hint");
const deliverSelect = $("deliver-select");
const toastEl = $("toast");

const state = {
  ws: null,
  nextId: 1,
  pending: new Map(), // id -> {resolve, reject}
  streaming: false,
  busy: false,
  currentMessage: null, // assistant message container being streamed
  currentTool: new Map(), // toolCallId -> row element
  sessionFile: null,
};

/* ---------------- JSON-RPC helpers ---------------- */

function tokenFromUrl() {
  return new URLSearchParams(location.search).get("token") ?? "";
}

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(tokenFromUrl())}`);
  state.ws = ws;

  ws.onopen = () => {
    setConn(true);
    toast("已连接");
    refreshAll();
  };

  ws.onclose = () => {
    setConn(false);
    state.pending.forEach((p) => p.reject(new Error("连接断开")));
    state.pending.clear();
    scheduleReconnect();
  };

  ws.onerror = () => ws.close();

  ws.onmessage = (evt) => {
    let msg;
    try {
      msg = JSON.parse(evt.data);
    } catch {
      return;
    }
    if (msg && msg.method === "pi:event") {
      handleEvent(msg.params);
    } else if (msg && typeof msg.id !== "undefined") {
      const p = state.pending.get(msg.id);
      if (!p) return;
      state.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || "RPC error"));
      else p.resolve(msg.result);
    }
  };
}

let reconnectDelay = 1000;
let reconnectTimer = null;
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 10000);
}

function request(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = state.nextId++;
    state.pending.set(id, { resolve, reject });
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    } else {
      state.pending.delete(id);
      reject(new Error("未连接"));
    }
  });
}

function setConn(online) {
  connEl.textContent = online ? "已连接" : "未连接";
  connEl.className = "conn " + (online ? "online" : "offline");
  if (online) reconnectDelay = 1000;
}

/* ---------------- 初始化数据 ---------------- */

async function refreshAll() {
  try {
    const st = await request("pi:getState");
    applyState(st);
  } catch (e) {
    toast("getState: " + e.message);
  }
  try { renderSessions(await request("pi:listSessions")); } catch { /* ignore */ }
  try { renderModels(await request("pi:listModels")); } catch { /* ignore */ }
  try { renderCommands(await request("pi:listCommands")); } catch { /* ignore */ }
}

function applyState(st) {
  state.busy = !!st.isStreaming;
  state.sessionFile = st.sessionFile;
  $("st-session").textContent = "会话 " + (st.sessionName || (st.sessionFile ? st.sessionFile.split("/").pop() : "—"));
  $("st-model").textContent = "模型 " + (st.model ? `${st.model.provider}/${st.model.id}` : "—");
  $("st-thinking").textContent = "思考 " + (st.thinkingLevel ?? "—");
  const ctx = st.context || {};
  if (ctx.percent == null || ctx.contextWindow == null) {
    $("st-usage-text").textContent = "占用 —";
    $("st-usage-fill").style.width = "0";
  } else {
    const pct = Math.round(ctx.percent * 1000) / 10;
    $("st-usage-text").textContent = `${pct}% (${fmt(ctx.tokens)} / ${fmt(ctx.contextWindow)})`;
    $("st-usage-fill").style.width = `${Math.round(ctx.percent * 100)}%`;
  }
  const thinkingSel = $("thinking-select");
  if (!thinkingSel.dataset.bound) {
    thinkingSel.dataset.bound = "1";
    ["off", "minimal", "low", "medium", "high", "xhigh", "max"].forEach((lvl) => {
      const opt = document.createElement("option");
      opt.value = lvl;
      opt.textContent = lvl;
      thinkingSel.appendChild(opt);
    });
    thinkingSel.addEventListener("change", () => {
      request("pi:setThinkingLevel", { level: thinkingSel.value }).catch((e) => toast("setThinkingLevel: " + e.message));
    });
  }
  if (st.thinkingLevel) thinkingSel.value = st.thinkingLevel;
  updateBusyUi();
}

/* ---------------- 侧栏渲染 ---------------- */

function renderSessions(sessions) {
  const box = $("sessions");
  box.innerHTML = "";
  if (!sessions || sessions.length === 0) {
    box.innerHTML = '<div class="hint">暂无会话</div>';
    return;
  }
  const ul = document.createElement("ul");
  ul.className = "cmd-list";
  for (const s of sessions) {
    const li = document.createElement("li");
    li.title = s.path;
    const name = s.name || s.firstMessage || s.path.split("/").pop();
    li.innerHTML = `<span class="cmd-name">${esc(name)}</span> <span class="cmd-src">${s.messageCount} 条</span>`;
    if (state.sessionFile && s.path === state.sessionFile) li.innerHTML += ' <span class="cmd-src">← 当前</span>';
    ul.appendChild(li);
  }
  box.appendChild(ul);
}

function renderModels(models) {
  const sel = $("model-select");
  sel.innerHTML = "";
  sel.disabled = !models || models.length === 0;
  if (!models || models.length === 0) {
    sel.appendChild(new Option("无模型", ""));
    return;
  }
  for (const m of models) {
    sel.appendChild(new Option(`${m.name} (${m.provider})`, `${m.provider}/${m.id}`));
  }
  sel.addEventListener("change", () => {
    const [provider, ...rest] = sel.value.split("/");
    const modelId = rest.join("/");
    request("pi:setModel", { provider, modelId })
      .then(() => toast(`已切换 ${sel.value}`))
      .catch((e) => toast("setModel: " + e.message));
  });
}

function renderCommands(commands) {
  const box = $("commands");
  box.innerHTML = "";
  if (!commands || commands.length === 0) {
    box.innerHTML = '<div class="hint">无命令</div>';
    return;
  }
  for (const c of commands) {
    const li = document.createElement("li");
    li.innerHTML = `<div class="cmd-name">/${esc(c.name)}</div><div class="cmd-src">${esc(c.description || c.source)}</div>`;
    box.appendChild(li);
  }
}

/* ---------------- 事件处理 ---------------- */

function handleEvent(params) {
  const type = params.type;
  switch (type) {
    case "message_start":
      onMessageStart(params.message);
      break;
    case "message_update":
      onMessageUpdate(params.event);
      break;
    case "message_end":
      onMessageEnd(params.message);
      break;
    case "tool_execution_start":
      onToolStart(params);
      break;
    case "tool_execution_update":
      onToolUpdate(params);
      break;
    case "tool_execution_end":
      onToolEnd(params);
      break;
    case "agent_start":
      state.busy = true;
      updateBusyUi();
      break;
    case "agent_end":
    case "agent_settled":
      state.busy = false;
      updateBusyUi();
      break;
    case "queue_update": {
      const q = [];
      if (params.steering?.length) q.push(`steer×${params.steering.length}`);
      if (params.followUp?.length) q.push(`followUp×${params.followUp.length}`);
      appendSeparator(q.length ? `队列: ${q.join(" ")}` : "队列已清空");
      break;
    }
    case "state":
      applyState(params);
      break;
    case "session_start":
    case "session_switch_ready":
      toast(`会话已切换 (${params.reason || "ready"})`);
      refreshAll();
      break;
    case "session_shutdown":
      toast(`会话关闭 (${params.reason})`);
      break;
    case "session_before_switch":
      toast(`会话切换中… (${params.reason})`);
      break;
    case "notify":
      bridgeNotify(params.message, params.notifyType);
      break;
    case "setStatus":
      bridgeSetStatus(params.statusKey, params.statusText);
      break;
    case "setWidget":
      bridgeSetWidget(params.widgetKey, params.widgetLines);
      break;
    case "message":
      // 兼容占位
      break;
    default:
      // 未知事件忽略
      break;
  }
}

/* ---------------- 聊天流渲染 ---------------- */

function makeMsgHead(role, extra) {
  const head = document.createElement("div");
  head.className = "msg-head";
  const span = document.createElement("span");
  span.className = "role-" + role;
  const labels = { user: "你", assistant: "助手", toolResult: "工具" };
  span.textContent = (extra ? `${labels[role] || role} · ${extra}` : labels[role] || role);
  head.appendChild(span);
  return head;
}

function onMessageStart(message) {
  const role = message?.role || "unknown";
  const wrap = document.createElement("div");
  wrap.className = "msg";
  if (role === "toolResult") {
    wrap.appendChild(makeMsgHead("toolResult", message.toolName));
    const body = document.createElement("div");
    body.className = "msg-body tool";
    body.textContent = textOfContent(message.content) || "(空)";
    wrap.appendChild(body);
    chatEl.appendChild(wrap);
    scrollDown();
    return;
  }
  wrap.appendChild(makeMsgHead(role));
  const body = document.createElement("div");
  body.className = "msg-body";
  if (role === "assistant") {
    state.currentMessage = { wrap, body, thinking: null, text: "" };
    // 若已有内容（恢复场景），先渲染
    const txt = textOfContent(message?.content);
    if (txt) {
      body.textContent = txt;
      state.currentMessage.text = txt;
    }
  } else if (message?.content) {
    body.textContent = textOfContent(message.content);
  }
  wrap.appendChild(body);
  chatEl.appendChild(wrap);
  scrollDown();
}

function onMessageUpdate(evt) {
  if (!evt) return;
  const cur = state.currentMessage;
  if (evt.type === "text_delta") {
    if (!cur) return;
    cur.text += evt.delta || "";
    if (cur.thinking && cur.thinking.style.display !== "none") {
      // thinking 展开中，文本先不动
      cur.body.textContent = cur.text;
    } else {
      cur.body.textContent = cur.text;
    }
    scrollDown();
  } else if (evt.type === "thinking_start" || evt.type === "thinking_delta") {
    if (!cur) return;
    if (!cur.thinking) {
      const t = document.createElement("div");
      t.className = "msg-body thinking";
      t.textContent = "思考中…";
      t.addEventListener("click", () => {
        const hidden = t.style.display === "none";
        t.style.display = hidden ? "" : "none";
      });
      cur.wrap.appendChild(t);
      cur.thinking = t;
    }
    if (evt.type === "thinking_delta" && evt.delta) {
      cur.thinking.textContent = "💭 " + (evt.partial?.thinking || cur.thinking.textContent);
    }
    scrollDown();
  } else if (evt.type === "toolcall_start" || evt.type === "toolcall_delta") {
    // 工具执行由 tool_execution_* 事件渲染
  }
}

function onMessageEnd(message) {
  const cur = state.currentMessage;
  if (message?.role === "assistant" && cur) {
    const finalText = textOfContent(message.content);
    if (finalText) {
      cur.body.textContent = finalText;
      cur.text = finalText;
    }
    state.currentMessage = null;
    scrollDown();
  }
}

function onToolStart(params) {
  const wrap = document.createElement("div");
  wrap.className = "msg";
  wrap.appendChild(makeMsgHead("toolResult", params.toolName));
  const body = document.createElement("div");
  body.className = "msg-body tool";
  body.textContent = JSON.stringify(params.args ?? {});
  wrap.appendChild(body);
  chatEl.appendChild(wrap);
  state.currentTool.set(params.toolCallId, { wrap, body });
  scrollDown();
}

function onToolUpdate(params) {
  const row = state.currentTool.get(params.toolCallId);
  if (!row) return;
  const partial = params.partialResult;
  const text = textOfContent(partial?.content);
  if (text) row.body.textContent = text.length > 2000 ? text.slice(-2000) : text;
  scrollDown();
}

function onToolEnd(params) {
  const row = state.currentTool.get(params.toolCallId);
  if (!row) return;
  state.currentTool.delete(params.toolCallId);
  if (params.isError) row.body.classList.add("error");
  const text = textOfContent(params.result?.content);
  if (text) row.body.textContent = text.length > 4000 ? text.slice(-4000) + "\n…(截断)" : text;
  else if (params.isError) row.body.textContent = "执行失败";
  scrollDown();
}

function appendSeparator(text) {
  const sep = document.createElement("div");
  sep.className = "sep";
  sep.textContent = `— ${text} —`;
  chatEl.appendChild(sep);
  scrollDown();
}

/* ---------------- 工具函数 ---------------- */

function textOfContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => (b && typeof b === "object" && "text" in b ? b.text : ""))
    .join("\n");
}

function esc(s) {
  const div = document.createElement("div");
  div.textContent = String(s ?? "");
  return div.innerHTML;
}

function fmt(n) {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

function scrollDown() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.add("hidden"), 4000);
}

/* ---------------- 桥接面板 ---------------- */

function bridgeNotify(message, type) {
  const box = $("bridge-notify");
  const div = document.createElement("div");
  div.className = "bridge-notify";
  div.textContent = `[${type || "info"}] ${message}`;
  box.prepend(div);
  while (box.children.length > 6) box.lastChild.remove();
}

function bridgeSetStatus(key, text) {
  const box = $("bridge-status");
  let row = document.querySelector(`.bridge-status-row[data-key="${esc(key)}"]`);
  if (text == null) {
    if (row) row.remove();
    return;
  }
  if (!row) {
    row = document.createElement("div");
    row.className = "bridge-status-row";
    row.dataset.key = key;
    row.innerHTML = `<span class="k">${esc(key)}</span> <span class="v"></span>`;
    box.appendChild(row);
  }
  row.querySelector(".v").textContent = text;
}

function bridgeSetWidget(key, lines) {
  const box = $("bridge-widget");
  if (!lines || lines.length === 0) {
    if (box.dataset.key === key) {
      box.dataset.key = "";
      box.textContent = "";
    }
    return;
  }
  box.dataset.key = key;
  box.textContent = lines.join("\n");
}

/* ---------------- 输入区 ---------------- */

function updateBusyUi() {
  busyHintEl.classList.toggle("hidden", !state.busy);
  $("btn-abort").disabled = !state.busy;
  $("btn-send").disabled = !state.ws || state.ws.readyState !== WebSocket.OPEN;
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;
  const params = { text };
  if (state.busy) params.deliverAs = deliverSelect.value;
  inputEl.value = "";
  try {
    await request("pi:sendMessage", params);
  } catch (e) {
    inputEl.value = text;
    toast("发送失败: " + e.message);
  }
}

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});
$("btn-send").addEventListener("click", sendMessage);
$("btn-abort").addEventListener("click", () => {
  request("pi:abort").catch((e) => toast("abort: " + e.message));
});
$("btn-refresh-sessions").addEventListener("click", () => {
  request("pi:listSessions").then(renderSessions).catch((e) => toast(e.message));
});

/* ---------------- 启动 ---------------- */

if (!tokenFromUrl()) {
  toast("缺少 token：请从 /web 输出的完整 URL 打开");
  setConn(false);
} else {
  connect();
}
