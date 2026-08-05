import { useMemo, useState } from "react";
import { FileText, Loader2, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FileGroup, SkillInfo } from "@/lib/types";

/** "+" 弹层：可搜索，分块展示全部 skills 与工作目录文件（SPEC §7） */
export function PlusPicker({
  open,
  onOpenChange,
  skills,
  files,
  loading,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  skills: SkillInfo[];
  files: FileGroup[];
  loading: boolean;
  onInsert: (text: string) => void;
}) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filteredSkills = useMemo(
    () => (q ? skills.filter((s) => s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q)) : skills),
    [skills, q],
  );
  const filteredFiles = useMemo(() => {
    if (!q) return files;
    return files
      .map((g) => ({ ...g, files: g.files.filter((f) => f.path.toLowerCase().includes(q)) }))
      .filter((g) => g.files.length > 0);
  }, [files, q]);

  const totalSkills = skills.length;
  const totalFiles = files.reduce((n, g) => n + g.files.length, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setQuery(""); }}>
      <DialogContent className="flex max-w-lg flex-col gap-3 p-0">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="text-base">插入内容</DialogTitle>
          <DialogDescription>
            共 {totalSkills} 个 skills · {totalFiles} 个文件（点击插入到输入框，不自动发送）
          </DialogDescription>
        </DialogHeader>
        <div className="px-5">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索 skill 或文件…"
              className="pl-8"
              autoFocus
            />
          </div>
        </div>
        <Tabs defaultValue="skills" className="px-5 pb-5">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="skills">
              <Sparkles data-icon="inline-start" className="size-3.5" /> Skills
            </TabsTrigger>
            <TabsTrigger value="files">
              <FileText data-icon="inline-start" className="size-3.5" /> 文件
            </TabsTrigger>
          </TabsList>
          <TabsContent value="skills">
            <ScrollArea className="h-56">
              {loading && skills.length === 0 ? (
                <div className="text-muted-foreground flex items-center gap-1.5 p-2 text-xs">
                  <Loader2 className="size-3 animate-spin" /> 加载中…
                </div>
              ) : filteredSkills.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">无匹配 skill</div>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {filteredSkills.map((s) => (
                    <li key={s.name}>
                      <button
                        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/60"
                        onClick={() => onInsert(`/${s.name} `)}
                      >
                        <Badge variant="secondary" className="shrink-0 font-mono">/{s.name}</Badge>
                        <span className="text-muted-foreground min-w-0 flex-1 truncate">{s.description ?? ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </TabsContent>
          <TabsContent value="files">
            <ScrollArea className="h-56">
              {loading && files.length === 0 ? (
                <div className="text-muted-foreground flex items-center gap-1.5 p-2 text-xs">
                  <Loader2 className="size-3 animate-spin" /> 加载中…
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">无匹配文件</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredFiles.map((g) => (
                    <div key={g.dir}>
                      <div className="text-muted-foreground px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                        {g.dir === "." ? "根目录" : g.dir}
                      </div>
                      <ul className="flex flex-col gap-0.5">
                        {g.files.map((f) => (
                          <li key={f.path}>
                            <button
                              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted/60"
                              onClick={() => onInsert(f.path)}
                            >
                              <FileText className="text-muted-foreground size-3 shrink-0" />
                              <span className="min-w-0 flex-1 truncate font-mono">{f.path}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
