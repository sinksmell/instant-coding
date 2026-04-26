"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
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
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useTask } from "@/lib/tasks";

interface LogEntry {
  id: string;
  type: "command" | "output" | "error" | "success";
  content: string;
  timestamp: string;
}

function parseLogs(rawLogs: unknown[]): LogEntry[] {
  if (!Array.isArray(rawLogs) || rawLogs.length === 0) {
    return [
      {
        id: "1",
        type: "output",
        content: "等待任务开始执行...",
        timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      },
    ];
  }
  return rawLogs.map((log: unknown, i: number) => {
    const l = log as Record<string, string>;
    return {
      id: String(i + 1),
      type: (l.type as LogEntry["type"]) || "output",
      content: l.content || "",
      timestamp: l.timestamp || new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    };
  });
}

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const { task, loading, error, refresh } = useTask(params.id);
  const [activeTab, setActiveTab] = useState<"diff" | "log">("log");
  const [copied, setCopied] = useState(false);

  // Poll task status every 3 seconds
  useEffect(() => {
    if (!task || task.status === "completed" || task.status === "failed") return;
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [task?.status, refresh]);

  const logs = parseLogs(task?.logs || []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-background items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex h-screen bg-background items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">{error || "任务不存在"}</p>
          <Link href="/" className="text-primary hover:underline text-sm">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  const statusConfig = {
    pending: { label: "等待中", color: "text-muted-foreground", icon: <Loader2 className="w-4 h-4 animate-spin" /> },
    running: { label: "执行中", color: "text-amber-500", icon: <Loader2 className="w-4 h-4 animate-spin" /> },
    completed: { label: "已完成", color: "text-green-500", icon: <CheckCircle2 className="w-4 h-4" /> },
    failed: { label: "失败", color: "text-red-500", icon: <CheckCircle2 className="w-4 h-4" /> },
  };

  const status = statusConfig[task.status as keyof typeof statusConfig] || statusConfig.pending;

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
                <h1 className="font-semibold">{task.title}</h1>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">
                  {task.repo_owner} / {task.repo_name} / {task.branch}
                </span>
              </div>
              <div className={`flex items-center gap-1 text-xs mt-0.5 ${status.color}`}>
                {status.icon}
                <span>{status.label}</span>
              </div>
            </div>
          </div>
          {task.pr_url && (
            <Link
              href={task.pr_url}
              target="_blank"
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              查看 PR
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Chat */}
          <div className="flex-1 flex flex-col border-r border-border overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* User message */}
              <div className="flex gap-3 flex-row-reverse">
                <div className="w-8 h-8 rounded-lg bg-muted text-foreground flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-medium">U</span>
                </div>
                <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap bg-primary text-primary-foreground rounded-tr-none">
                  {task.description}
                </div>
              </div>

              {/* Assistant response */}
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-none px-4 py-3 max-w-[80%]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium">Agent</span>
                    <span className={`text-xs ${status.color}`}>{status.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="bg-card rounded-lg p-3 text-xs font-mono text-muted-foreground border border-border">
                    <pre>{JSON.stringify({
                      status: task.status,
                      repo: `${task.repo_owner}/${task.repo_name}`,
                      branch: task.branch,
                      created_at: task.created_at,
                    }, null, 2)}</pre>
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
                      {log.type === "error" && (
                        <div className="flex items-center gap-2 pl-6 py-2">
                          <span className="text-sm text-red-500">{log.content}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {activeTab === "diff" && (
                <div className="space-y-4">
                  <div className="text-sm font-medium text-muted-foreground mb-4">文件变更</div>
                  {task.diff ? (
                    <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">{task.diff}</pre>
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-8">
                      暂无差异信息
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
