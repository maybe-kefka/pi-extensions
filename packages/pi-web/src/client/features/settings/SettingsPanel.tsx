import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";
import type { ModelInfo } from "@/entities/chat";
import { THEMES, THEME_NAMES, type ThemePreference } from "@/entities/theme";

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
  return (
    <div className="scrollbar-thin scrollbar-gutter-stable flex h-full flex-col gap-3 overflow-y-auto p-3">
      <Card className="gap-2 py-3">
        <CardHeader className="px-4 py-0">
          <CardTitle className="text-xs font-semibold tracking-wide uppercase">模型</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 px-4">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-8 shrink-0 text-xs">模型</span>
            <div className="min-w-0 flex-1">
              <Select
                value={currentModel ?? undefined}
                onValueChange={(v) => {
                  const idx = v.lastIndexOf("/");
                  onSetModel(v.slice(0, idx), v.slice(idx + 1));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="模型…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
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
            <span className="text-muted-foreground w-8 shrink-0 text-xs">思考</span>
            <div className="min-w-0 flex-1">
              <Select value={thinkingLevel ?? undefined} onValueChange={onSetThinking}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="思考等级…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
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
        </CardContent>
      </Card>

      <Card className="gap-2 py-3">
        <CardHeader className="px-4 py-0">
          <CardTitle className="text-xs font-semibold tracking-wide uppercase">外观</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 px-4">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-8 shrink-0 text-xs">主题</span>
            <div className="min-w-0 flex-1">
              <Select
                value={themePreference.theme}
                onValueChange={(v) => onThemeChange({ ...themePreference, theme: v as ThemePreference["theme"] })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="主题…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {THEME_NAMES.map((name) => (
                      <SelectItem key={name} value={name}>
                        {THEMES[name].label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-8 shrink-0 text-xs">深浅</span>
            <div className="min-w-0 flex-1">
              <Select
                value={themePreference.scheme}
                onValueChange={(v) => onThemeChange({ ...themePreference, scheme: v as ThemePreference["scheme"] })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="深浅…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="system">跟随系统</SelectItem>
                    <SelectItem value="light">浅色</SelectItem>
                    <SelectItem value="dark">深色</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
