"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Sidebar } from "@/components/sidebar";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Monitor,
  Plug,
  MessageSquare,
  Settings2,
  Palette,
  UserCircle,
  Info,
  Plus,
  Loader2,
  Play,
  Square,
  Trash2,
  ExternalLink,
  Server,
  X,
  ChevronDown,
  GitBranch,
  Key,
  Eye,
  EyeOff,
  Save,
} from "lucide-react";
import Link from "next/link";

type SettingTab = "general" | "environment" | "connector" | "apikey" | "chat" | "interface" | "account" | "about";

interface Repo {
  name: string;
  owner: string;
  full_name: string;
  description: string | null;
  private: boolean;
}

interface Codespace {
  id: string;
  repo_owner: string;
  repo_name: string;
  branch: string;
  codespace_name: string;
  status: string;
  web_url: string;
  created_at: string;
}

const sidebarItems: { id: SettingTab; label: string; icon: React.ReactNode; group: "coder" | "studio" }[] = [
  { id: "general", label: "通用", icon: <Settings2 className="w-4 h-4" />, group: "coder" },
  { id: "environment", label: "环境", icon: <Monitor className="w-4 h-4" />, group: "coder" },
  { id: "connector", label: "连接器", icon: <Plug className="w-4 h-4" />, group: "coder" },
  { id: "apikey", label: "API Key", icon: <Key className="w-4 h-4" />, group: "coder" },
  { id: "chat", label: "对话", icon: <MessageSquare className="w-4 h-4" />, group: "coder" },
  { id: "interface", label: "界面", icon: <Palette className="w-4 h-4" />, group: "studio" },
  { id: "account", label: "账号", icon: <UserCircle className="w-4 h-4" />, group: "studio" },
  { id: "about", label: "关于", icon: <Info className="w-4 h-4" />, group: "studio" },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingTab>("environment");

  const coderItems = sidebarItems.filter((i) => i.group === "coder");
  const studioItems = sidebarItems.filter((i) => i.group === "studio");

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">返回</span>
          </Link>
          <h1 className="ml-4 text-lg font-semibold">设置</h1>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Settings Sidebar */}
          <aside className="w-56 border-r border-border bg-card p-2 space-y-0.5">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Instant Coding 设置
            </div>
            {coderItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors",
                  activeTab === item.id
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}

            <div className="px-3 py-2 mt-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Studio 设置
            </div>
            {studioItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors",
                  activeTab === item.id
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </aside>

          {/* Settings Content */}
          <main className="flex-1 overflow-y-auto p-8">
            {activeTab === "environment" && <EnvironmentTab />}

            {activeTab === "general" && (
              <div className="max-w-2xl">
                <h2 className="text-xl font-semibold mb-6">通用设置</h2>
                <div className="space-y-6">
                  <div className="bg-card border border-border rounded-xl p-6">
                    <h3 className="text-sm font-medium mb-4">编辑器</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">自动保存</p>
                          <p className="text-xs text-muted-foreground">编辑时自动保存文件</p>
                        </div>
                        <div className="w-11 h-6 bg-primary rounded-full relative cursor-pointer">
                          <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">显示行号</p>
                          <p className="text-xs text-muted-foreground">在编辑器中显示行号</p>
                        </div>
                        <div className="w-11 h-6 bg-primary rounded-full relative cursor-pointer">
                          <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "connector" && (
              <div className="max-w-2xl">
                <h2 className="text-xl font-semibold mb-6">连接器</h2>
                <div className="space-y-4">
                  <div className="bg-card border border-border rounded-xl p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">GitHub</p>
                        <p className="text-sm text-muted-foreground">已连接: sinksmell</p>
                      </div>
                      <button className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors">
                        断开连接
                      </button>
                    </div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                          <path d="M21.579 6.855c.14-.465 0-.806-.662-.806h-2.193c-.558 0-.813.295-.953.619 0 0-1.115 2.675-2.695 4.414-.51.513-.743.675-1.021.675-.139 0-.341-.162-.341-.627V6.855c0-.558-.162-.806-.627-.806H9.253c-.341 0-.558.255-.558.5 0 .523.787.644.869 2.117v3.199c0 .703-.127.83-.403.83-.743 0-2.551-2.721-3.624-5.832-.209-.595-.42-.836-.98-.836H2.816c-.627 0-.744.295-.744.619 0 .58.743 3.461 3.461 7.271 1.812 2.601 4.363 4.012 6.687 4.012 1.393 0 1.565-.313 1.565-.851v-1.966c0-.627.133-.752.577-.752.328 0 .895.164 2.213 1.688 1.506 1.748 1.755 2.532 2.603 2.532h2.193c.627 0 .939-.313.758-.931-.197-.615-.907-1.51-1.849-2.568-.51-.6-1.276-1.246-1.507-1.567-.328-.419-.233-.6 0-.968 0 0 2.742-3.869 3.028-5.187z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">Vercel</p>
                        <p className="text-sm text-muted-foreground">已连接: sinksmell</p>
                      </div>
                      <button className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors">
                        断开连接
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "apikey" && <ApiKeySettings />}

            {activeTab === "interface" && (
              <div className="max-w-2xl">
                <h2 className="text-xl font-semibold mb-6">界面设置</h2>
                <div className="bg-card border border-border rounded-xl p-6 space-y-6">
                  <div>
                    <h3 className="text-sm font-medium mb-3">主题</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <button className="p-3 rounded-lg border-2 border-primary bg-background text-center">
                        <div className="w-full h-12 rounded bg-white border border-border mb-2" />
                        <span className="text-xs">浅色</span>
                      </button>
                      <button className="p-3 rounded-lg border border-border bg-card text-center hover:border-primary/50">
                        <div className="w-full h-12 rounded bg-slate-900 border border-border mb-2" />
                        <span className="text-xs">深色</span>
                      </button>
                      <button className="p-3 rounded-lg border border-border bg-card text-center hover:border-primary/50">
                        <div className="w-full h-12 rounded bg-gradient-to-r from-white to-slate-900 border border-border mb-2" />
                        <span className="text-xs">跟随系统</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "account" && (
              <div className="max-w-2xl">
                <h2 className="text-xl font-semibold mb-6">账号设置</h2>
                <div className="bg-card border border-border rounded-xl p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-medium">
                      S
                    </div>
                    <div>
                      <p className="font-medium text-lg">sinksmell</p>
                      <p className="text-sm text-muted-foreground">sinksmell@example.com</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-3 border-t border-border">
                      <span className="text-sm">用户名</span>
                      <span className="text-sm text-muted-foreground">sinksmell</span>
                    </div>
                    <div className="flex items-center justify-between py-3 border-t border-border">
                      <span className="text-sm">邮箱</span>
                      <span className="text-sm text-muted-foreground">sinksmell@example.com</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "about" && (
              <div className="max-w-2xl">
                <h2 className="text-xl font-semibold mb-6">关于</h2>
                <div className="bg-card border border-border rounded-xl p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-6 h-6 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" />
                        <path d="M2 17l10 5 10-5" />
                        <path d="M2 12l10 5 10-5" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-lg">Instant Coding</p>
                      <p className="text-sm text-muted-foreground">v0.1.0</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Instant Coding 是一款基于 Vercel 平台的网页版智能编程工具，
                    集成了 AI 辅助编程、实时代码执行、GitHub 集成和多环境支持等功能，
                    帮助开发者更高效地编写和管理代码。
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function EnvironmentTab() {
  const { data: session } = useSession();
  const [codespaces, setCodespaces] = useState<Codespace[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Creation modal state
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [selectedBranch, setSelectedBranch] = useState("main");
  const [creating, setCreating] = useState(false);
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);

  useEffect(() => {
    loadCodespaces();
  }, []);

  // Load repos when create modal opens
  useEffect(() => {
    if (!showCreateModal || !session?.user?.githubId) return;
    setRepoLoading(true);
    fetch("/api/github/repos")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((d) => {
        const loaded = d.repos || [];
        setRepos(loaded);
        if (loaded.length > 0) setSelectedRepo(loaded[0]);
      })
      .catch(console.error)
      .finally(() => setRepoLoading(false));
  }, [showCreateModal, session?.user?.githubId]);

  // Load branches when repo changes
  useEffect(() => {
    if (!selectedRepo) {
      setBranches([]);
      setSelectedBranch("main");
      return;
    }
    setBranchLoading(true);
    fetch(`/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/branches`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((d) => {
        const loaded = d.branches || [];
        setBranches(loaded);
        setSelectedBranch(loaded[0] || "main");
      })
      .catch(console.error)
      .finally(() => setBranchLoading(false));
  }, [selectedRepo?.owner, selectedRepo?.name]);

  async function loadCodespaces() {
    setLoading(true);
    try {
      const res = await fetch("/api/codespaces");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setCodespaces(data.codespaces || []);
    } catch (err) {
      console.error("Load codespaces failed:", err);
    } finally {
      setLoading(false);
    }
  }

  async function createCodespace() {
    if (!selectedRepo) return;
    setCreating(true);
    try {
      const res = await fetch("/api/codespaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_owner: selectedRepo.owner,
          repo_name: selectedRepo.name,
          branch: selectedBranch,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      setShowCreateModal(false);
      setSelectedRepo(null);
      setSelectedBranch("main");
      await loadCodespaces();
    } catch (err) {
      alert(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function startCs(id: string) {
    setActionId(id);
    try {
      const res = await fetch(`/api/codespaces/${id}/start`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      await loadCodespaces();
    } catch (err) {
      alert(err instanceof Error ? err.message : "启动失败");
    } finally {
      setActionId(null);
    }
  }

  async function stopCs(id: string) {
    setActionId(id);
    try {
      const res = await fetch(`/api/codespaces/${id}/stop`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      await loadCodespaces();
    } catch (err) {
      alert(err instanceof Error ? err.message : "停止失败");
    } finally {
      setActionId(null);
    }
  }

  async function deleteCs(id: string) {
    if (!confirm("确定要删除这个 Codespace 吗？此操作不可恢复。")) return;
    setActionId(id);
    try {
      const res = await fetch(`/api/codespaces/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setCodespaces((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">环境</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          添加环境
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-sm text-muted-foreground">
              <th className="px-6 py-3 font-medium">状态</th>
              <th className="px-6 py-3 font-medium">仓库</th>
              <th className="px-6 py-3 font-medium">分支</th>
              <th className="px-6 py-3 font-medium">Codespace</th>
              <th className="px-6 py-3 font-medium">创建时间</th>
              <th className="px-6 py-3 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" />
                </td>
              </tr>
            ) : codespaces.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                  <Server className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">暂无 Codespaces</p>
                  <p className="text-xs mt-1">点击上方按钮添加环境</p>
                </td>
              </tr>
            ) : (
              codespaces.map((cs) => {
                const isActive = cs.status === "Available";
                return (
                  <tr
                    key={cs.id}
                    className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isActive ? "bg-green-500" : "bg-amber-500"}`} />
                        <span className="text-sm">{isActive ? "运行中" : "已停止"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">{cs.repo_owner}/{cs.repo_name}</td>
                    <td className="px-6 py-4 text-sm">{cs.branch}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{cs.codespace_name || "-"}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {new Date(cs.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {cs.web_url && (
                          <a
                            href={cs.web_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                            title="在浏览器中打开"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        {isActive ? (
                          <button
                            onClick={() => stopCs(cs.id)}
                            disabled={actionId === cs.id}
                            className="p-1.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
                            title="停止"
                          >
                            {actionId === cs.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                          </button>
                        ) : (
                          <button
                            onClick={() => startCs(cs.id)}
                            disabled={actionId === cs.id}
                            className="p-1.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
                            title="启动"
                          >
                            {actionId === cs.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                          </button>
                        )}
                        <button
                          onClick={() => deleteCs(cs.id)}
                          disabled={actionId === cs.id}
                          className="p-1.5 rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-lg font-semibold">添加环境</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 rounded-lg hover:bg-accent transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-6 space-y-4">
              {/* Repo selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">选择仓库</label>
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowRepoDropdown(!showRepoDropdown);
                      setShowBranchDropdown(false);
                    }}
                    disabled={repoLoading}
                    className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border border-border bg-background text-sm text-left hover:bg-accent/50 transition-colors disabled:opacity-60"
                  >
                    {repoLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : selectedRepo ? (
                      <span>{selectedRepo.owner} / {selectedRepo.name}</span>
                    ) : (
                      <span className="text-muted-foreground">选择仓库</span>
                    )}
                    <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground" />
                  </button>
                  {showRepoDropdown && repos.length > 0 && (
                    <div className="absolute top-full left-0 mt-1 w-full max-h-[240px] overflow-y-auto bg-popover border border-border rounded-lg shadow-lg z-50">
                      {repos.map((repo) => (
                        <button
                          key={repo.full_name}
                          onClick={() => {
                            setSelectedRepo(repo);
                            setShowRepoDropdown(false);
                          }}
                          className="flex flex-col w-full px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                        >
                          <span className="font-medium">{repo.name}</span>
                          {repo.description && (
                            <span className="text-xs text-muted-foreground truncate">{repo.description}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Branch selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">选择分支</label>
                <div className="relative">
                  <button
                    onClick={() => {
                      if (!selectedRepo || branchLoading) return;
                      setShowBranchDropdown(!showBranchDropdown);
                      setShowRepoDropdown(false);
                    }}
                    disabled={!selectedRepo || branchLoading}
                    className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border border-border bg-background text-sm text-left hover:bg-accent/50 transition-colors disabled:opacity-60"
                  >
                    <GitBranch className="w-4 h-4 text-muted-foreground" />
                    {branchLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>{selectedBranch}</span>
                    )}
                    <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground" />
                  </button>
                  {showBranchDropdown && branches.length > 0 && (
                    <div className="absolute top-full left-0 mt-1 w-full max-h-[200px] overflow-y-auto bg-popover border border-border rounded-lg shadow-lg z-50">
                      {branches.map((branch) => (
                        <button
                          key={branch}
                          onClick={() => {
                            setSelectedBranch(branch);
                            setShowBranchDropdown(false);
                          }}
                          className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-accent transition-colors text-left"
                        >
                          <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{branch}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={createCodespace}
                  disabled={creating || !selectedRepo}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiKeySettings() {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user/api-key")
      .then((res) => res.json())
      .then((data) => {
        if (data.hasKey) setHasSavedKey(true);
        if (data.baseUrl) setBaseUrl(data.baseUrl);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim() && !baseUrl.trim() && !hasSavedKey) return;
    setSaving(true);
    try {
      const res = await fetch("/api/user/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim() || undefined,
          baseUrl: baseUrl.trim() || undefined,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setHasSavedKey(true);
        setApiKey("");
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert("保存失败，请重试");
      }
    } catch {
      alert("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold mb-6">API Key 管理</h2>
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2c5.514 0 10 4.486 10 10s-4.486 10-10 10S2 17.514 2 12 6.486 2 12 2zm-1 5v4H7v2h4v4h2v-4h4v-2h-4V7h-2z"/>
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-medium">Claude API 配置</p>
            <p className="text-sm text-muted-foreground mt-1">
              你的配置仅存储在你的账户中，平台不会访问或使用。
              所有 AI 调用都将使用你自己的 Key 和代理地址。
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium">ANTHROPIC_API_KEY</label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasSavedKey ? "已设置（输入新值覆盖）" : "sk-ant-api03-..."}
              className="w-full px-4 py-2.5 pr-10 rounded-lg border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            获取地址：<a href="https://console.anthropic.com/settings/keys" target="_blank" className="text-primary hover:underline">Anthropic Console</a>
          </p>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium">ANTHROPIC_BASE_URL（可选）</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.anthropic.com 或你的代理地址"
            className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            如果使用第三方代理或兼容接口，请填写对应的 Base URL
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving || (!apiKey.trim() && !baseUrl.trim() && !hasSavedKey)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            <Save className="w-4 h-4" />
            {saving ? "保存中..." : saved ? "已保存" : "保存"}
          </button>
          {saved && <span className="text-sm text-green-500">配置已保存</span>}
        </div>
      </div>
    </div>
  );
}
