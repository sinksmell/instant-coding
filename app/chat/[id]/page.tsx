"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  GitBranch,
  ExternalLink,
  Terminal,
  FileDiff,
  CheckCircle2,
  ChevronRight,
  Copy,
  Check,
  Maximize2,
  X,
} from "lucide-react";
import Link from "next/link";

interface LogEntry {
  id: string;
  type: "command" | "output" | "error" | "success";
  content: string;
  timestamp: string;
}

const logs: LogEntry[] = [
  {
    id: "1",
    type: "command",
    content: "cd /workspace && ls -la",
    timestamp: "14:50:10",
  },
  {
    id: "2",
    type: "output",
    content: "total 64\ndrwxr-xr-x  1 root root  376 Apr 14 09:28 .\ndrwxr-xr-x  1 root root 1134 Apr 14 09:28 ..\n-rw-r--r--  1 root root  376 Apr 14 09:28 README.md\n-rw-r--r--  1 root root  215 Apr 14 09:28 go.mod\n-rw-r--r--  1 root root  184 Apr 14 09:28 main.go",
    timestamp: "14:50:11",
  },
  {
    id: "3",
    type: "command",
    content: "cat .github/workflows/go.yml",
    timestamp: "14:50:15",
  },
  {
    id: "4",
    type: "output",
    content: "name: Go CI\non:\n  push:\n    branches: [ main, master, develop ]\n  pull_request:\n    branches: [ main, master, develop ]\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n    - uses: actions/checkout@v3\n    - name: Set up Go\n      uses: actions/setup-go@v4\n      with:\n        go-version: '1.21'\n    - name: Test\n      run: go test ./...",
    timestamp: "14:50:16",
  },
  {
    id: "5",
    type: "success",
    content: "分析完成：CI 配置已修复，README 已更新，GitHub Pages 已配置",
    timestamp: "14:54:52",
  },
];

const messages = [
  {
    id: "1",
    role: "user" as const,
    content: "1. CI 有报错，需要 fix\n2. README 中保留 iblt 这算法的介绍，而不是原先的分组平方根的算法\n3. GitHub page 配置有问题，需要优化，自动生成的 url 访问页面 404",
  },
  {
    id: "2",
    role: "assistant" as const,
    content: "我来帮你修复这些问题。让我先检查当前仓库的状态和配置。",
  },
];

export default function ChatPage({ params }: { params: { id: string } }) {
  const [activeTab, setActiveTab] = useState<"diff" | "log">("log");
  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold">CI GitHub Page Issues</h1>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">sinksmell / files-cmp / main</span>
              </div>
            </div>
          </div>
          <Link
            href="#"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            查看 PR
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Chat */}
          <div className="flex-1 flex flex-col border-r border-border overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                      msg.role === "assistant"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" />
                        <path d="M2 17l10 5 10-5" />
                        <path d="M2 12l10 5 10-5" />
                      </svg>
                    ) : (
                      <span className="text-sm font-medium">S</span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                      msg.role === "assistant"
                        ? "bg-muted text-foreground rounded-tl-none"
                        : "bg-primary text-primary-foreground rounded-tr-none"
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Work Complete Card */}
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-none px-4 py-3 max-w-[80%]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium">工作完成</span>
                    <span className="text-xs text-muted-foreground">· 4m42s</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="bg-card rounded-lg p-3 text-xs font-mono text-muted-foreground border border-border">
                    <pre>{`{
  "message": "Command \ncd /workspace && ls -la executed with exit code 0.",
  "observation": "run",
  "content": "total 64\\ndrwxr-xr-x  1 root root..."
}`}</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Logs / Diff */}
          <div className="w-[500px] flex flex-col bg-card">
            {/* Tabs */}
            <div className="flex items-center border-b border-border">
              <button
                onClick={() => setActiveTab("diff")}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                  activeTab === "diff"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <FileDiff className="w-4 h-4" />
                差异
              </button>
              <button
                onClick={() => setActiveTab("log")}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                  activeTab === "log"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Terminal className="w-4 h-4" />
                日志
              </button>
              <div className="ml-auto flex items-center gap-1 px-3">
                <button className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground">
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === "log" && (
                <div className="space-y-4">
                  <div className="text-sm font-medium text-muted-foreground mb-4">Shell</div>
                  {logs.map((log) => (
                    <div key={log.id} className="space-y-1">
                      {log.type === "command" && (
                        <div className="flex items-start gap-2 group">
                          <span className="text-green-500 font-mono text-sm">$</span>
                          <code className="text-sm font-mono text-foreground">{log.content}</code>
                          <button
                            onClick={() => copyToClipboard(log.content)}
                            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}
                      {log.type === "output" && (
                        <pre className="text-sm font-mono text-muted-foreground pl-6 whitespace-pre-wrap">
                          {log.content}
                        </pre>
                      )}
                      {log.type === "success" && (
                        <div className="flex items-center gap-2 pl-6 py-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="text-sm text-green-600">{log.content}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {activeTab === "diff" && (
                <div className="space-y-4">
                  <div className="text-sm font-medium text-muted-foreground mb-4">文件变更</div>
                  <div className="space-y-3">
                    <div className="border border-border rounded-lg overflow-hidden">
                      <div className="bg-green-500/10 px-4 py-2 text-sm font-medium text-green-700 border-b border-green-500/20">
                        + .github/workflows/go.yml
                      </div>
                      <div className="p-4 text-xs font-mono space-y-1">
                        <div className="text-green-600">+ name: Go CI</div>
                        <div className="text-green-600">+ on:</div>
                        <div className="text-green-600">+   push:</div>
                        <div className="text-green-600">+     branches: [ main, master, develop ]</div>
                      </div>
                    </div>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <div className="bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-700 border-b border-blue-500/20">
                        M README.md
                      </div>
                      <div className="p-4 text-xs font-mono space-y-1">
                        <div className="text-red-500">- 分组平方根算法介绍...</div>
                        <div className="text-green-600">+ IBLT (Invertible Bloom Lookup Table) 算法介绍...</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
