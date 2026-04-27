"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Plus,
  Search,
  Settings,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  User,
  LogOut,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { useTasks } from "@/lib/tasks";
import type { Task } from "@/lib/tasks";

export function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-card h-screen transition-[width] duration-200",
        isExpanded ? "w-64" : "w-14",
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 py-3 border-b border-border h-14">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 shadow-sm">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        {isExpanded && (
          <span className="font-semibold text-[15px] tracking-tight flex-1 truncate">Instant Coding</span>
        )}
        {isExpanded && (
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1 rounded hover:bg-accent active:scale-95 transition-all text-muted-foreground"
            title="折叠侧边栏"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* New Chat Button */}
      <div className={cn("py-2", isExpanded ? "px-3" : "px-2")}>
        <button
          onClick={() => router.push("/")}
          className={cn(
            "flex items-center gap-2 w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all shadow-sm",
            isExpanded ? "px-3 py-2 justify-start" : "p-2 justify-center",
          )}
          title="新建对话"
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          {isExpanded && <span className="text-sm font-medium">新建对话</span>}
        </button>
      </div>

      {/* Search */}
      {isExpanded && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜索任务"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-muted text-xs outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Task list */}
      <TaskList isExpanded={isExpanded} onExpand={() => setIsExpanded(true)} query={searchQuery} />

      {/* Bottom actions */}
      <div className="border-t border-border p-2 space-y-0.5">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2.5 rounded-lg hover:bg-accent active:scale-[0.98] transition-all text-muted-foreground hover:text-foreground",
            isExpanded ? "px-3 py-2" : "p-2 justify-center",
          )}
          title="设置"
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          {isExpanded && <span className="text-sm">设置</span>}
        </Link>
        <UserSection isExpanded={isExpanded} />
      </div>
    </aside>
  );
}

const isMockLogin = process.env.NEXT_PUBLIC_MOCK_LOGIN === "true";

function TaskList({
  isExpanded,
  onExpand,
  query,
}: {
  isExpanded: boolean;
  onExpand: () => void;
  query: string;
}) {
  const { tasks, loading } = useTasks();

  const filtered = useMemo(() => {
    if (!query.trim()) return tasks;
    const q = query.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.repo_name?.toLowerCase().includes(q),
    );
  }, [tasks, query]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {isExpanded && (
        <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            任务历史
          </span>
          <span className="text-[10px] text-muted-foreground/70 ml-auto">
            {loading ? "…" : filtered.length}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-1">
        {loading && (
          <div className="flex justify-center py-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && filtered.length === 0 && isExpanded && (
          <div className="px-3 py-6 text-xs text-muted-foreground text-center">
            {query ? "无匹配任务" : "暂无任务"}
          </div>
        )}
        {filtered.map((task) => (
          <TaskRow key={task.id} task={task} isExpanded={isExpanded} onRowHoverExpand={onExpand} />
        ))}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  isExpanded,
  onRowHoverExpand,
}: {
  task: Task;
  isExpanded: boolean;
  onRowHoverExpand: () => void;
}) {
  const dot = statusDot(task.status);

  return (
    <Link
      href={`/chat/${task.id}`}
      onMouseEnter={!isExpanded ? onRowHoverExpand : undefined}
      className={cn(
        "group relative flex items-center gap-2 rounded-md hover:bg-accent active:scale-[0.99] transition-all",
        isExpanded ? "px-2 py-1.5" : "p-2 justify-center",
      )}
      title={isExpanded ? undefined : task.title}
    >
      <span
        className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", dot)}
        aria-hidden
      />
      {isExpanded && (
        <>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate group-hover:text-foreground text-foreground/90">
              {task.title}
            </div>
            <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
              {task.repo_name && <span className="truncate">{task.repo_name}</span>}
              {task.repo_name && <span className="text-muted-foreground/40">·</span>}
              <span>{relativeTime(task.created_at)}</span>
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </>
      )}
    </Link>
  );
}

function statusDot(status: Task["status"]): string {
  switch (status) {
    case "completed":
      return "bg-green-500";
    case "running":
      return "bg-amber-500 animate-pulse";
    case "failed":
      return "bg-red-500";
    default:
      return "bg-muted-foreground/50";
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} 月前`;
  return `${Math.floor(mo / 12)} 年前`;
}

function UserSection({ isExpanded }: { isExpanded: boolean }) {
  const { data: session } = useSession();

  if (session?.user) {
    return (
      <button
        onClick={() => signOut()}
        className={cn(
          "flex items-center gap-2.5 rounded-lg hover:bg-accent active:scale-[0.98] transition-all w-full text-left",
          isExpanded ? "px-3 py-2" : "p-2 justify-center",
        )}
        title={isExpanded ? "点击退出登录" : session.user.name || "退出"}
      >
        {session.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt={session.user.name || ""}
            className="w-6 h-6 rounded-full flex-shrink-0"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[11px] text-primary-foreground font-medium flex-shrink-0">
            {(session.user.name?.[0] || "U").toUpperCase()}
          </div>
        )}
        {isExpanded && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm font-medium truncate flex-1">
              {session.user.name || session.user.email || "User"}
            </span>
            <LogOut className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </div>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={() =>
        isMockLogin
          ? signIn("mock", { username: "dev-user", callbackUrl: "/" })
          : signIn("github")
      }
      className={cn(
        "flex items-center gap-2.5 rounded-lg hover:bg-accent active:scale-[0.98] transition-all w-full text-left text-muted-foreground hover:text-foreground",
        isExpanded ? "px-3 py-2" : "p-2 justify-center",
      )}
      title={isExpanded ? undefined : isMockLogin ? "本地测试登录" : "GitHub 登录"}
    >
      <User className="w-4 h-4 flex-shrink-0" />
      {isExpanded && (
        <span className="text-sm">{isMockLogin ? "本地测试登录" : "GitHub 登录"}</span>
      )}
    </button>
  );
}
