import { describe, expect, it } from "vitest";
import { expandSkillChips, stripFrontmatter, type SkillLookupEntry } from "./skill-expand";

const skills: SkillLookupEntry[] = [
  {
    name: "code-review",
    path: "/home/user/.agents/skills/code-review/SKILL.md",
    baseDir: "/home/user/.agents/skills/code-review",
    content: "---\nname: code-review\ndescription: 审查代码\n---\n# Code Review\n两轴审查。",
  },
  { name: "pdf", path: "/home/user/.agents/skills/pdf/SKILL.md", baseDir: "/home/user/.agents/skills/pdf", content: "# PDF\nPDF 处理。" },
];

describe("stripFrontmatter", () => {
  it("剥离 --- 前导 frontmatter", () => {
    expect(stripFrontmatter("---\na: 1\n---\n正文")).toBe("正文");
  });
  it("无 frontmatter 原样", () => {
    expect(stripFrontmatter("正文")).toBe("正文");
  });
});

describe("expandSkillChips", () => {
  it("skill 标记 → XML（name/location/baseDir/正文）", () => {
    const out = expandSkillChips("\u0001skill:code-review\u0001", skills);
    expect(out).toBe(
      '<skill name="code-review" location="/home/user/.agents/skills/code-review/SKILL.md">\n' +
        "References are relative to /home/user/.agents/skills/code-review.\n\n" +
        "# Code Review\n两轴审查。\n</skill>",
    );
  });

  it("file 标记 → 剥离为路径文本", () => {
    expect(expandSkillChips("请读 \u0001file:src/a.ts\u0001", skills)).toBe("请读 src/a.ts");
  });

  it("未知 skill 标记 → 保留原文（不抛错）", () => {
    expect(expandSkillChips("\u0001skill:nope\u0001", skills)).toBe("\u0001skill:nope\u0001");
  });

  it("手打 /skill: 文本（无标记）不展开", () => {
    expect(expandSkillChips("帮我 /skill:code-review 一下", skills)).toBe("帮我 /skill:code-review 一下");
  });

  it("混合：文本 + skill + file 顺序保持", () => {
    const out = expandSkillChips("先 \u0001skill:pdf\u0001 再读 \u0001file:b.ts\u0001 结尾", skills);
    expect(out).toContain("<skill name=\"pdf\"");
    expect(out).toContain("先 ");
    expect(out).toContain("再读 b.ts 结尾");
    expect(out.indexOf("先 ")).toBeLessThan(out.indexOf("<skill"));
    expect(out.indexOf("<skill")).toBeLessThan(out.indexOf("b.ts"));
  });
});
