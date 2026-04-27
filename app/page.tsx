"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { QuickActions } from "@/components/quick-actions";
import {
  ChevronDown,
  GitBranch,
  ArrowRight,
  Monitor,
  Loader2,
  Server,
  Plus,
} from "lucide-react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";

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

export default function Home() {
  const { data: session } = useSession();
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [selectedBranch, setSelectedBranch] = useState("main");
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Codespace selector
  const [codespaces, setCodespaces] = useState<Codespace[]>([]);
  const [selectedCodespace, setSelectedCodespace] = useState<Codespace | null>(null);
  const [showCsDropdown, setShowCsDropdown] = useState(false);
  const [csLoading, setCsLoading] = useState(false);
  const [creatingCs, setCreatingCs] = useState(false);

  // Load repos when user is logged in
  useEffect(() => {
    if (!session?.user?.githubId) {
      setRepos([]);
      setSelectedRepo(null);
      setBranches([]);
      setSelectedBranch("main");
      return;
    }

    setRepoLoading(true);
    fetch("/api/github/repos")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to load repos");
        }
        return res.json();
      })
      .then((data) => {
        const loaded = data.repos || [];
        setRepos(loaded);
        if (loaded.length > 0) {
          setSelectedRepo(loaded[0]);
        }
      })
      .catch((err) => {
        console.error("Load repos failed:", err);
      })
      .finally(() => setRepoLoading(false));
  }, [session?.user?.githubId]);

  // Load branches when selected repo changes
  useEffect(() => {
    if (!selectedRepo) {
      setBranches([]);
      setSelectedBranch("main");
      return;
    }

    setBranchLoading(true);
    fetch(`/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/branches`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to load branches");
        }
        return res.json();
      })
      .then((data) => {
        const loaded = data.branches || [];
        setBranches(loaded);
        setSelectedBranch(loaded[0] || "main");
      })
      .catch((err) => {
        console.error("Load branches failed:", err);
        setBranches([]);
      })
      .finally(() => setBranchLoading(false));
  }, [selectedRepo?.owner, selectedRepo?.name]);

  const handleRepoSelect = (repo: Repo) => {
    setSelectedRepo(repo);
    setShowRepoDropdown(false);
  };

  // Load codespaces for selector
  useEffect(() => {
    if (!session?.user?.githubId) {
      setCodespaces([]);
      setSelectedCodespace(null);
      return;
    }
    setCsLoading(true);
    fetch("/api/codespaces")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((data) => {
        const loaded = data.codespaces || [];
        setCodespaces(loaded);
        // Auto-select first available codespace if none selected
        if (!selectedCodespace && loaded.length > 0) {
          const available = loaded.find((c: Codespace) => c.status === "Available");
          setSelectedCodespace(available || loaded[0]);
        }
      })
      .catch(console.error)
      .finally(() => setCsLoading(false));
  }, [session?.user?.githubId]);

  // Update selected codespace if it disappears from list
  useEffect(() => {
    if (selectedCodespace && codespaces.length > 0) {
      const stillExists = codespaces.find((c) => c.id === selectedCodespace.id);
      if (!stillExists) {
        const available = codespaces.find((c) => c.status === "Available");
        setSelectedCodespace(available || codespaces[0] || null);
      }
    }
  }, [codespaces]);

  // Create a new codespace for the current repo/branch
  async function createCodespaceFromSelector() {
    if (!selectedRepo) return;
    setCreatingCs(true);
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
        throw new Error(data.error || "创建失败");
      }
      // Refresh list and auto-select
      const listRes = await fetch("/api/codespaces");
      if (listRes.ok) {
        const listData = await listRes.json();
        const loaded = listData.codespaces || [];
        setCodespaces(loaded);
        // Select the newly created one (most recent)
        const newest = loaded.find(
          (c: Codespace) =>
            c.repo_owner === selectedRepo.owner && c.repo_name === selectedRepo.name && c.branch === selectedBranch
        );
        setSelectedCodespace(newest || loaded[0] || null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "创建 Codespace 失败");
    } finally {
      setCreatingCs(false);
    }
  }

  const handleSubmit = async () => {
    if (!input.trim()) return;

    if (!session) {
      const isMock = process.env.NEXT_PUBLIC_MOCK_LOGIN === "true";
      isMock
        ? signIn("mock", { username: "dev-user", callbackUrl: "/" })
        : signIn("github");
      return;
    }

    if (!selectedRepo) {
      alert("请等待仓库加载完成");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.slice(0, 50),
          description: input,
          repo_owner: selectedRepo.owner,
          repo_name: selectedRepo.name,
          branch: selectedBranch,
          codespace_id: selectedCodespace?.id || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create task");
      }

      router.push(`/chat/${data.task.id}`);
    } catch (err) {
      console.error("Create task failed:", err);
      alert(err instanceof Error ? err.message : "创建任务失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Minimal Header for homepage */}
        <header className="h-14 flex items-center justify-end px-6">
          <Link
            href="/settings"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:bg-accent active:scale-[0.97] transition-all text-sm"
          >
            <Monitor className="w-4 h-4 text-muted-foreground" />
            <span>环境</span>
          </Link>
        </header>

        {/* Main content - centered chat input */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 pb-12">
          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-3">Instant Coding</h1>
            <p className="text-muted-foreground text-base">
              帮助您编写代码并将其无缝导出到 GitHub。
            </p>
          </div>

          {/* Input Card */}
          <div className="w-full max-w-2xl">
            {/* Repo & Branch selectors */}
            <div className="flex items-center gap-3 mb-3">
              {/* Repo Selector */}
              <div className="relative">
                <button
                  onClick={() => {
                    if (!session?.user?.githubId || repoLoading) return;
                    setShowRepoDropdown(!showRepoDropdown);
                    setShowBranchDropdown(false);
                  }}
                  disabled={repoLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 active:scale-[0.98] transition-all min-w-[200px] disabled:opacity-60 disabled:active:scale-100"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  {repoLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : selectedRepo ? (
                    <span className="text-sm font-medium">{selectedRepo.owner} / {selectedRepo.name}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">登录后选择仓库</span>
                  )}
                  <ChevronDown className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
                </button>

                {showRepoDropdown && repos.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 w-[320px] max-h-[320px] overflow-y-auto bg-popover border border-border rounded-xl shadow-lg z-50">
                    {repos.map((repo) => (
                      <button
                        key={repo.full_name}
                        onClick={() => handleRepoSelect(repo)}
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

              {/* Branch Selector */}
              <div className="relative">
                <button
                  onClick={() => {
                    if (!selectedRepo || branchLoading) return;
                    setShowBranchDropdown(!showBranchDropdown);
                    setShowRepoDropdown(false);
                  }}
                  disabled={!selectedRepo || branchLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 active:scale-[0.98] transition-all disabled:opacity-60 disabled:active:scale-100"
                >
                  <GitBranch className="w-4 h-4 text-muted-foreground" />
                  {branchLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <span className="text-sm font-medium">{selectedBranch}</span>
                  )}
                  <ChevronDown className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
                </button>

                {showBranchDropdown && branches.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 w-full min-w-[180px] bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50">
                    {branches.map((branch) => (
                      <button
                        key={branch}
                        onClick={() => {
                          setSelectedBranch(branch);
                          setShowBranchDropdown(false);
                        }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-accent transition-colors"
                      >
                        <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{branch}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Text Input Area */}
            <div className="bg-muted rounded-2xl p-1">
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="在这里编写你的创意代码。"
                  className="w-full p-4 bg-transparent text-sm outline-none resize-none min-h-[140px] placeholder:text-muted-foreground leading-relaxed"
                  rows={4}
                />
                <div className="flex items-center justify-between px-4 pb-3">
                  {/* Codespace Selector */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        if (!session?.user?.githubId || csLoading) return;
                        setShowCsDropdown(!showCsDropdown);
                      }}
                      disabled={!session?.user?.githubId || csLoading}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                      title={selectedCodespace ? `${selectedCodespace.repo_owner}/${selectedCodespace.repo_name} (${selectedCodespace.branch})` : "选择环境"}
                    >
                      <Server className="w-3.5 h-3.5" />
                      {csLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : selectedCodespace ? (
                        <span className="max-w-[140px] truncate">
                          {selectedCodespace.repo_name}
                        </span>
                      ) : (
                        <span>环境</span>
                      )}
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {showCsDropdown && (
                      <div className="absolute bottom-full left-0 mb-1 w-[260px] max-h-[280px] overflow-y-auto bg-popover border border-border rounded-xl shadow-lg z-50">
                        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                          选择 Codespace
                        </div>
                        {codespaces.map((cs) => {
                          const isActive = cs.status === "Available";
                          const isSelected = selectedCodespace?.id === cs.id;
                          return (
                            <button
                              key={cs.id}
                              onClick={() => {
                                setSelectedCodespace(cs);
                                setShowCsDropdown(false);
                              }}
                              className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors text-left ${
                                isSelected ? "bg-accent/60" : ""
                              }`}
                            >
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "bg-green-500" : "bg-amber-500"}`} />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium truncate">
                                  {cs.repo_owner}/{cs.repo_name}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {cs.branch} · {isActive ? "运行中" : "已停止"}
                                </div>
                              </div>
                              {isSelected && (
                                <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                              )}
                            </button>
                          );
                        })}
                        {/* Default option: create new for current repo */}
                        {selectedRepo && (
                          <>
                            {codespaces.length > 0 && (
                              <div className="border-t border-border" />
                            )}
                            <button
                              onClick={() => {
                                setShowCsDropdown(false);
                                createCodespaceFromSelector();
                              }}
                              disabled={creatingCs}
                              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left text-primary disabled:opacity-50"
                            >
                              {creatingCs ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Plus className="w-3.5 h-3.5" />
                              )}
                              <span className="text-xs">
                                基于 {selectedRepo.name} 创建新的
                              </span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Submit button */}
                  <button
                    disabled={!input.trim() || submitting}
                    onClick={handleSubmit}
                    className="flex items-center gap-2 px-5 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-primary hover:text-primary-foreground hover:shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 transition-all text-sm font-medium"
                  >
                    <span>{submitting ? "创建中..." : "编码"}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mt-6">
              <QuickActions />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
