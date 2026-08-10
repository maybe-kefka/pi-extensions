import { describe, expect, it } from "vitest";
import {
  applyListing,
  collapseDir,
  createRootTree,
  findNode,
  setDirState,
  setShowOptions,
  type FileTreeNode,
  type TreeState,
} from "./tree.js";

function node(path: string, type: "dir" | "file", children: FileTreeNode[] | null = null): FileTreeNode {
  return { path, name: path.split("/").pop() ?? path, type, children };
}

const root: TreeState = createRootTree({ showExcluded: false, showHidden: false });

describe("createRootTree", () => {
  it("初始只有一个未加载的根节点，开关透传", () => {
    expect(root.nodes).toHaveLength(1);
    expect(root.nodes[0].path).toBe("");
    expect(root.nodes[0].children).toBeNull();
    expect(root.showExcluded).toBe(false);
    expect(root.showHidden).toBe(false);
  });
});

describe("applyListing", () => {
  it("根目录加载：目录节点未加载（null）、文件节点已加载（[]）", () => {
    const next = applyListing(root, "", [
      { name: "src", type: "dir", size: 0, mtimeMs: 1 },
      { name: "README.md", type: "file", size: 10, mtimeMs: 1 },
    ]);
    expect(next.nodes[0].children?.map((c) => c.path)).toEqual(["src", "README.md"]);
    expect(next.nodes[0].children?.[0].children).toBeNull();
    expect(next.nodes[0].children?.[1].children).toEqual([]);
    expect(next.nodes[0].loading).toBe(false);
    expect(next.nodes[0].error).toBe(false);
  });

  it("子目录加载：只替换目标目录的 children，其它不动", () => {
    const loaded = applyListing(root, "", [{ name: "src", type: "dir", size: 0, mtimeMs: 1 }]);
    const next = applyListing(loaded, "src", [{ name: "main.ts", type: "file", size: 5, mtimeMs: 1 }]);
    const src = findNode(next.nodes, "src");
    expect(src?.children?.map((c) => c.path)).toEqual(["src/main.ts"]);
    // 根节点 children 不变
    expect(next.nodes[0].children?.map((c) => c.path)).toEqual(["src"]);
  });

  it("深路径替换（多层已展开）", () => {
    const a = applyListing(root, "", [{ name: "a", type: "dir", size: 0, mtimeMs: 1 }]);
    const b = applyListing(a, "a", [{ name: "b", type: "dir", size: 0, mtimeMs: 1 }]);
    const c = applyListing(b, "a/b", [{ name: "c.ts", type: "file", size: 1, mtimeMs: 1 }]);
    expect(findNode(c.nodes, "a/b/c.ts")?.type).toBe("file");
    expect(findNode(c.nodes, "a")?.children?.[0].children?.[0].path).toBe("a/b/c.ts");
  });
});

describe("findNode", () => {
  it("查找根节点", () => {
    expect(findNode(root.nodes, "")?.name).toBe("");
  });
  it("查找深层节点", () => {
    const a = applyListing(root, "", [{ name: "a", type: "dir", size: 0, mtimeMs: 1 }]);
    const b = applyListing(a, "a", [{ name: "b", type: "file", size: 1, mtimeMs: 1 }]);
    expect(findNode(b.nodes, "a/b")?.type).toBe("file");
  });
  it("未加载子树中的路径返回 null", () => {
    expect(findNode(root.nodes, "a/b")).toBeNull();
  });
});

describe("setDirState / collapseDir / setShowOptions", () => {
  it("加载中标记可设置并保留其它节点", () => {
    const loaded = applyListing(root, "", [
      { name: "a", type: "dir", size: 0, mtimeMs: 1 },
      { name: "b", type: "dir", size: 0, mtimeMs: 1 },
    ]);
    const mid = setDirState(loaded, "a", { loading: true });
    expect(findNode(mid.nodes, "a")?.loading).toBe(true);
    expect(findNode(mid.nodes, "b")?.loading).toBeUndefined();
  });

  it("折叠后 children 回到 null（未加载态）", () => {
    const loaded = applyListing(root, "", [{ name: "a", type: "dir", size: 0, mtimeMs: 1 }]);
    const collapsed = collapseDir(loaded, "a");
    expect(findNode(collapsed.nodes, "a")?.children).toBeNull();
  });

  it("折叠后再展开会重新拉取（applyListing 覆盖）", () => {
    const loaded = applyListing(root, "", [{ name: "a", type: "dir", size: 0, mtimeMs: 1 }]);
    const collapsed = collapseDir(loaded, "a");
    const reloaded = applyListing(collapsed, "a", [{ name: "new.ts", type: "file", size: 1, mtimeMs: 1 }]);
    expect(findNode(reloaded.nodes, "a/new.ts")?.type).toBe("file");
  });

  it("开关透传更新", () => {
    const next = setShowOptions(root, { showHidden: true });
    expect(next.showHidden).toBe(true);
    expect(next.showExcluded).toBe(false);
  });
});
