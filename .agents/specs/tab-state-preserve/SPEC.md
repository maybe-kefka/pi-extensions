# SPEC — tab-state-preserve：重挂状态零损失（快照增强）

> 迭代规格（R28）。基线：`.agents/specs/pi-web/SPEC.md` §7（前端）/ §10（模块划分与测试策略）。前置迭代：`split-drag-ux`（split/拖拽交互）。

## Problem Statement

split/跨组拖拽/组结构变化时，tab 实例被 React 跨父重挂（卸载+重建）——这是框架行为（含 portal 方案——`createPortal` 的 container 切换同样触发重挂，已验证）。重挂丢失：

- **chat**：滚动位置（已有比例恢复）、输入草稿（已有）、消息流（已有快照）——已兜底但属于"近似恢复"；焦点/光标丢失（可接受）
- **file**：**编辑器未保存内容、光标、编辑器滚动完全丢失**（CodeMirror 状态在实例内）——split 文件 tab 即丢编辑态
- **diff**：重挂后重新拉取（内容恢复），展开/滚动丢失（只读视图，可接受）

**用户期望**：只要 tab 不关闭（或页面不刷新），布局操作**完全不影响 tab 状态**。

## Solution

在 React 框架内把"重挂的恢复"做到**完全精确（状态零损失）**——快照增强：

- **chat**：既有机制核对确认（消息快照、滚动比例、草稿均精确）——不改
- **file**：EditorPane 编辑器状态**持续上报**（内容 + 光标 + 编辑器滚动）到 App ref；重挂时**完整恢复**（reducer 初始化恢复内容/哈希/脏标记，编辑器就绪后恢复光标与滚动）——与 chat 同模式（持续上报避免卸载时序的隔代错位）
- **关闭清理**：tab 关闭时删除其快照条目（chat 消息/滚动、编辑器状态）——防陈旧快照污染重开

## User Stories

1. 作为 web 控制台用户，我希望 split 文件 tab 后，未保存的编辑内容、光标位置、编辑器滚动完全保留，以便并排对比时不丢编辑态。
2. 作为 web 控制台用户，我希望 split chat tab 后，消息、滚动、草稿完全保留（现状行为保持），以便布局操作不打断阅读与输入。
3. 作为 web 控制台用户，我希望关闭 tab 后其快照被清理，以便重开同会话/同文件时从干净状态开始（重拉历史/重新加载），不被陈旧快照污染。
4. 作为 web 控制台用户，我希望保存/冲突检测在恢复场景下依然正确（恢复的 savedHash 参与冲突检测），以便未保存修改不因恢复而丢失冲突保护。

## Implementation Decisions

- **EditorPane 状态快照**（新接口）：
  ```ts
  interface EditorSnapshot {
    edit: EditState;                          // 内容/哈希/脏标记/冲突（entities/files 既有状态机）
    selection: { anchor: number; head: number } | null;  // CodeMirror 主 selection
    scrollTop: number | null;                 // 编辑器滚动
  }
  props: savedState?: EditorSnapshot; onStateSave?: (path, snapshot) => void;
  ```
- **恢复（重挂）**：`useReducer(reducer, EMPTY, (e) => savedState?.edit ?? initialEditState(e))`——内容/哈希/脏标记整体恢复；**首次 loadFile 跳过 `reload` dispatch**（否则磁盘内容覆盖未保存修改；用 ref 只跳过首次——手动"重新加载"按钮不受影响）；`onCreateEditor` 里 `view.dispatch({selection})` + `view.scrollDOM.scrollTop` 恢复光标与滚动。
- **持续上报**：CodeMirror `onUpdate`（每次 view 更新——内容/光标/滚动变化都会触发）→ 组装快照（`edit` 读 ref 最新）→ `onStateSave`（App ref 写，无渲染）——与 chat 快照同模式，规避卸载 cleanup 的隔代错位；卸载兜底保留。
- **App 接线**：`editorStatesRef`（按 path）+ 传参；**关闭清理**：tab 关闭时删除 `chatStatesRef` / `chatScrollAnchorsRef` / `editorStatesRef` 对应条目。
- **diff tab**：不存取（只读视图，重挂重新拉取即可）——记录为已知限制。
- **chat**：现有快照/滚动/草稿机制保持不变（已精确）。

## Testing Decisions

- **Seam S1（EditorPane 组件契约，jsdom + CodeMirror mock 为 textarea）**：卸载/更新上报快照（content 来自编辑输入）；`savedState` 传入后初始内容/脏标记恢复（textarea value 断言）；首次加载不覆盖恢复内容（readFile RPC 返回不同内容时 value 仍为恢复值）；恢复的哈希参与后续保存（冲突 mock 断言）。光标/滚动在 mock 下不可测——真实 CodeMirror 冒烟验收。
- **Seam S2（App 接线）**：无测试基建——浏览器冒烟：split 文件 tab → 编辑内容/光标/滚动保留；关闭后重开 → 干净状态。
- **既有测试**：chat 快照/滚动测试保持绿（机制未改）。
- 验收总门：`npm test` + `npm run typecheck` 全绿 + 浏览器冒烟。

## Out of Scope

- React 重挂本身（框架行为，portal 方案已验证无效）——不消除，只精确恢复。
- diff tab 的展开/滚动保留。
- chat 焦点/光标恢复（split 时无输入场景，低价值）。
- 页面刷新的全量重建（快照保留作兜底，行为不变）。
- 服务端/协议层改动。

## Further Notes

- 方案由 grilling 三轮确认：portal 方案被 React 框架限制否决（container 切换重挂，单测证实）→ 用户选定"快照增强（状态零损失）"。
- EditorPane 内容本就在 `EditState`（reducer）——恢复路径是"状态提升到 App ref + reducer 初始化"，不涉及 CodeMirror doc 序列化（受控组件）。
