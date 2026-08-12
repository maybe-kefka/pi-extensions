import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** 渲染错误边界：崩溃显示错误卡片（不黑屏）+ 重载按钮 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }



  render() {
    if (this.state.error) {
      return (
        <div className="bg-background text-foreground flex h-dvh flex-col items-center justify-center gap-3 p-6">
          <div className="text-sm font-semibold">界面渲染出错</div>
          <div className="text-muted-foreground max-w-md text-center text-xs break-all">{this.state.error.message}</div>
          <button
            className="bg-primary text-primary-foreground cursor-pointer rounded-md px-3 py-1.5 text-xs"
            onClick={() => location.reload()}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
