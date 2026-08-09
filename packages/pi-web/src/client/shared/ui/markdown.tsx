import { isValidElement, Suspense, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

/** 从 React 节点（含高亮 span 元素）递归提取纯文本 */
function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children);
  return "";
}

/**
 * Markdown 渲染组件（assistant 气泡正文专用）。
 * 官方同款底层：react-markdown + remark-gfm + rehype-highlight。
 * 样式走 shadcn token；代码块带语言标签 + 复制按钮；链接新标签打开。
 */

function CodeBlock({ language, className, children }: { language: string; className?: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = nodeText(children);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用（非安全上下文等）时静默 */
    }
  };
  return (
    <div className="my-2 overflow-hidden rounded-lg border bg-muted/50">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1">
        <span className="text-muted-foreground truncate font-mono text-xs">{language || "code"}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "已复制" : "复制代码"}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors"
        >
          {copied ? <Check data-icon className="size-3" /> : <Copy data-icon className="size-3" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-sm leading-relaxed">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown-body">
      <Suspense fallback={null}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
            pre: ({ children }) => <>{children}</>,
            code: ({ className, children }) => {
              const lang = /language-(\w+)/.exec(className ?? "")?.[1];
              if (lang) {
                return <CodeBlock language={lang} className={className}>{children}</CodeBlock>;
              }
              return <code>{children}</code>;
            },
          }}
        >
          {text}
        </ReactMarkdown>
      </Suspense>
    </div>
  );
}
