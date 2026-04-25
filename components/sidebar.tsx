"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Plus,
  Search,
  MessageSquare,
  GitBranch,
  Settings,
  ChevronDown,
  Clock,
  CheckCircle2,
  Circle,
  X,
} from "lucide-react";
import Link from "next/link";

interface Task {
  id: string;
  title: string;
  repo: string;
  branch: string;
  status: "completed" | "in_progress" | "pending";
  time: string;
}

const recentTasks: Task[] = [
  {
    id: "1",
    title: "CI GitHub Page Issues",
    repo: "files-cmp",
    branch: "main",
    status: "completed",
    time: "4m42s",
  },
  {
    id: "2",
    title: "GitHub Pages Setup",
    repo: "files-cmp",
    branch: "feat/update_readme",
    status: "completed",
    time: "2m15s",
  },
  {
    id: "3",
    title: "优化 README 指南",
    repo: "files-cmp",
    branch: "feat/iblt-sparse-sync",
    status: "completed",
    time: "3m30s",
  },
  {
    id: "4",
    title: "Create New Feature Branch",
    repo: "files-cmp",
    branch: "main",
    status: "pending",
    time: "",
  },
  {
    id: "5",
    title: "重构代码建议",
    repo: "files-cmp",
    branch: "master",
    status: "completed",
    time: "5m10s",
  },
];

export function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-card h-screen transition-all duration-300",
        isExpanded ? "w-64" : "w-16"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        {isExpanded && (
          <span className="font-semibold text-lg tracking-tight">Instant Coding</span>
        )}
      </div>

      {/* New Chat Button */}
      <div className="px-3 py-3">
        <button className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          {isExpanded && <span className="text-sm font-medium">新建对话</span>}
        </button>
      </div>

      {/* Search */}
      {isExpanded && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜索对话"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-muted text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            />
          </div>
        </div>
      )}

      {/* Recent Tasks */}
      <div className="flex-1 overflow-hidden">
        <div className="px-3 py-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
            {isExpanded && <span className="text-xs font-medium uppercase tracking-wider">所有任务</span>}
          </button>
        </div>

        <div className="overflow-y-auto h-[calc(100%-40px)]">
          {recentTasks.map((task) => (
            <Link
              key={task.id}
              href={`/chat/${task.id}`}
              className="flex items-start gap-3 px-3 py-2.5 hover:bg-accent transition-colors group"
            >
              <div className="mt-0.5 flex-shrink-0">
                {task.status === "completed" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : task.status === "in_progress" ? (
                  <Clock className="w-4 h-4 text-amber-500" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              {isExpanded && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {task.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {task.repo} / {task.branch}
                  </p>
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="border-t border-border p-3 space-y-1">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        >
          <Settings className="w-4 h-4" />
          {isExpanded && <span className="text-sm">设置</span>}
        </Link>
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-xs text-primary-foreground font-medium">
            S
          </div>
          {isExpanded && <span className="text-sm font-medium">sinksmell</span>}
        </div>
      </div>
    </aside>
  );
}
