/**
 * 用户消息内容段模型（领域层共享）：
 * - 渲染侧（user-content：skill/file 标记 → chip）
 * - 序列化侧（chip-serialize：\u0001 标记 → 段）
 * 两套解析器语义不同（不同标记语法），但段结构同构——类型在此共享。
 */

export type UserContentSegment =
  | { type: "text"; text: string }
  | { type: "skill"; name: string }
  | { type: "file"; path: string };
