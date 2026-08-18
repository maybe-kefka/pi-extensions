import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/shared/ui";
import { ToggleGroup } from "radix-ui";
import type { ModelInfo } from "@/entities/chat";
import { getThemePreview, THEMES, THEME_NAMES, type ThemePreference } from "@/entities/theme";

export interface SettingsPanelProps {
  models: ModelInfo[];
  currentModel: string | null;
  thinkingLevel: string | null;
  thinkingLevels: string[];
  onSetModel: (provider: string, modelId: string) => void;
  onSetThinking: (level: string) => void;
  themePreference: ThemePreference;
  onThemeChange: (pref: ThemePreference) => void;
}

/** 设置面板（activity bar）：模型/思考级别/主题 */
export function SettingsPanel(props: SettingsPanelProps) {
  const { models, currentModel, thinkingLevel, thinkingLevels, onSetModel, onSetThinking, themePreference, onThemeChange } = props;
  const currentModelLabel = models.find((model) => `${model.provider}/${model.id}` === currentModel)?.name ?? currentModel ?? "未选择";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-9 shrink-0 items-center gap-2 px-3">
        <span className="text-sm font-semibold">设置</span>
      </header>
      <div className="scrollbar-thin scrollbar-gutter-stable flex min-h-0 flex-1 flex-col overflow-y-auto">
        <section className="flex flex-col gap-2 p-3" aria-labelledby="settings-model-heading">
          <h2 id="settings-model-heading" className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
            模型
          </h2>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label htmlFor="settings-model" className="text-muted-foreground w-8 shrink-0 text-xs">
                模型
              </label>
              <div className="min-w-0 flex-1">
                <Select
                  value={currentModel ?? undefined}
                  onValueChange={(v) => {
                    const idx = v.lastIndexOf("/");
                    onSetModel(v.slice(0, idx), v.slice(idx + 1));
                  }}
                >
                  <SelectTrigger id="settings-model" aria-label={`模型：${currentModelLabel}`} title={currentModelLabel} className="w-full min-w-0">
                    <SelectValue placeholder="模型…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel className="sr-only">模型</SelectLabel>
                      {models.map((m) => (
                        <SelectItem key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                          {m.name} ({m.provider})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="settings-thinking" className="text-muted-foreground w-8 shrink-0 text-xs">
                思考
              </label>
              <div className="min-w-0 flex-1">
                <Select value={thinkingLevel ?? undefined} onValueChange={onSetThinking}>
                  <SelectTrigger id="settings-thinking" aria-label="思考等级" className="w-full min-w-0">
                    <SelectValue placeholder="思考等级…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel className="sr-only">思考</SelectLabel>
                      {thinkingLevels.length === 0 && <SelectItem value="off">off</SelectItem>}
                      {thinkingLevels.map((lvl) => (
                        <SelectItem key={lvl} value={lvl}>
                          {lvl}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </section>

        <section className="border-foreground/10 flex flex-col gap-2 border-t p-3" aria-labelledby="settings-appearance-heading">
          <h2 id="settings-appearance-heading" className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
            外观
          </h2>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="settings-theme" className="text-muted-foreground w-8 shrink-0 text-xs">
                主题
              </label>
              <div className="min-w-0 flex-1">
                <Select
                  value={themePreference.theme}
                  onValueChange={(v) =>
                    onThemeChange({
                      ...themePreference,
                      theme: v as ThemePreference["theme"],
                    })
                  }
                >
                  <SelectTrigger id="settings-theme" aria-label="主题" className="w-full min-w-0">
                    <SelectValue placeholder="主题…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel className="sr-only">主题</SelectLabel>
                      {THEME_NAMES.map((name) => {
                        const preview = getThemePreview(name);
                        return (
                          <SelectItem key={name} value={name}>
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="flex shrink-0 items-center gap-1.5" aria-hidden="true" title="浅色 / 深色主题预览">
                                {(["light", "dark"] as const).map((scheme) => (
                                  <span key={scheme} className="flex items-center gap-0.5">
                                    <span className="text-muted-foreground text-[11px]">{scheme === "light" ? "浅" : "深"}</span>
                                    {preview[scheme].map((color, index) => (
                                      <span key={index} className="size-2.5 rounded-sm" style={{ backgroundColor: color }} />
                                    ))}
                                  </span>
                                ))}
                              </span>
                              <span className="truncate">{THEMES[name].label}</span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-8 shrink-0 text-xs" id="settings-scheme-label">
                深浅
              </span>
              <ToggleGroup.Root
                type="single"
                value={themePreference.scheme}
                aria-label="色彩模式"
                className="bg-muted flex min-w-0 flex-1 rounded-md p-0.5"
                onValueChange={(value) => {
                  if (value)
                    onThemeChange({
                      ...themePreference,
                      scheme: value as ThemePreference["scheme"],
                    });
                }}
              >
                {(["system", "light", "dark"] as const).map((scheme) => (
                  <ToggleGroup.Item
                    key={scheme}
                    value={scheme}
                    aria-label={scheme === "system" ? "System" : scheme === "light" ? "Light" : "Dark"}
                    className="focus-visible:ring-ring data-[state=on]:bg-background data-[state=on]:text-foreground text-muted-foreground min-w-0 flex-1 rounded px-2 py-1 text-xs transition-[background-color,color,box-shadow] focus-visible:ring-2"
                  >
                    {scheme === "system" ? "System" : scheme === "light" ? "Light" : "Dark"}
                  </ToggleGroup.Item>
                ))}
              </ToggleGroup.Root>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
