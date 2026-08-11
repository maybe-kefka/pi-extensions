/**
 * 目录树客户端状态（entities/files）：纯函数——按需展开的树模型。
 * children === null 表示未加载（点击展开时拉取）；undefined 表示已加载但空？
 * 约定：null = 未加载，[] = 已加载无子项。
 */

export type EntryType = "dir" | "file";

export interface DirEntryDto {
  name: string;
  type: EntryType;
  size: number;
  mtimeMs: number;
}

export interface FileTreeNode {
  /** 相对 cwd 的路径（根节点为 ""） */
  path: string;
  name: string;
  type: EntryType;
  /** null = 未加载；[] = 已加载且无子项 */
  children: FileTreeNode[] | null;
  loading?: boolean;
  /** 加载失败标记（点击可重试） */
  error?: boolean;
}

export interface TreeState {
  nodes: FileTreeNode[];
}

export function createRootTree(): TreeState {
  return {
    nodes: [{ path: "", name: "", type: "dir", children: null }],
  };
}

/** 按路径查找节点；找不到返回 null */
export function findNode(nodes: FileTreeNode[], path: string): FileTreeNode | null {
  if (path === "") return nodes[0] ?? null;
  const walk = (list: FileTreeNode[]): FileTreeNode | null => {
    for (const n of list) {
      if (n.path === path) return n;
      if (n.children) {
        const found = walk(n.children);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(nodes);
}

/** 把 listDir 结果应用到指定目录节点（替换 children） */
export function applyListing(
  state: TreeState,
  dirPath: string,
  entries: DirEntryDto[],
): TreeState {
  const children: FileTreeNode[] = entries.map((e) => {
    const childPath = dirPath === "" ? e.name : `${dirPath}/${e.name}`;
    return { path: childPath, name: e.name, type: e.type, children: e.type === "dir" ? null : [] };
  });
  return { ...state, nodes: replaceChildren(state.nodes, dirPath, children) };
}

function replaceChildren(nodes: FileTreeNode[], dirPath: string, children: FileTreeNode[]): FileTreeNode[] {
  if (dirPath === "") {
    return [{ ...nodes[0], children, loading: false, error: false }];
  }
  return nodes.map((n) => {
    if (n.path === dirPath) return { ...n, children, loading: false, error: false };
    if (n.children) {
      const next = replaceChildren(n.children, dirPath, children);
      if (next !== n.children) return { ...n, children: next };
    }
    return n;
  });
}

/** 标记目录节点加载中/失败（加载状态不阻塞其它操作） */
export function setDirState(
  state: TreeState,
  dirPath: string,
  patch: { loading?: boolean; error?: boolean },
): TreeState {
  const walk = (list: FileTreeNode[]): FileTreeNode[] =>
    list.map((n) => {
      if (n.path === dirPath) return { ...n, ...patch };
      if (n.children) return { ...n, children: walk(n.children) };
      return n;
    });
  return { ...state, nodes: walk(state.nodes) };
}

/** 折叠：把目录节点 children 置回 null（未加载态，下次展开重新拉取） */
export function collapseDir(state: TreeState, dirPath: string): TreeState {
  const walk = (list: FileTreeNode[]): FileTreeNode[] =>
    list.map((n) => {
      if (n.path === dirPath) return { ...n, children: null, loading: false };
      if (n.children) return { ...n, children: walk(n.children) };
      return n;
    });
  return { ...state, nodes: walk(state.nodes) };
}

/** 切换显示开关（保留已加载树；开关变化后下次展开按新规则拉取） */

