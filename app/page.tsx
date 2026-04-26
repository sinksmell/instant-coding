"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { QuickActions } from "@/components/quick-actions";
import {
  ChevronDown,
  GitBranch,
  ArrowRight,
  Monitor,
  Sparkles,
  User,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession, signIn } from "next-auth/react";

interface Repo {
  name: string;
  owner: string;
}

const repos: Repo[] = [
  { name: "files-cmp", owner: "sinksmell" },
  { name: "instant-coding", owner: "sinksmell" },
  { name: "finance", owner: "sinksmell" },
];

const branches = ["main", "master", "develop", "feat/update_readme", "feat/iblt-sparse-sync"];

interface RecentTask {
  id: string;
  title: string;
  repo: string;
  branch: string;
  status: "completed" | "in_progress" | "pending";
}

export default function Home() {
  const { data: session } = useSession();
  const router = useRouter();
  const [selectedRepo, setSelectedRepo] = useState(repos[0]);
  const [selectedBranch, setSelectedBranch] = useState("main");
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!input.trim()) return;

    if (!session) {
      const isMock = process.env.NEXT_PUBLIC_MOCK_LOGIN === "true";
      isMock
        ? signIn("mock", { username: "dev-user", callbackUrl: "/" })
        : signIn("github");
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
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors text-sm">
            <Monitor className="w-4 h-4 text-muted-foreground" />
            <span>环境</span>
          </button>
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
                    setShowRepoDropdown(!showRepoDropdown);
                    setShowBranchDropdown(false);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 transition-colors min-w-[200px]"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  <span className="text-sm font-medium">{selectedRepo.owner} / {selectedRepo.name}</span>
                  <ChevronDown className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
                </button>

                {showRepoDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50">
                    {repos.map((repo) => (
                      <button
                        key={repo.name}
                        onClick={() => {
                          setSelectedRepo(repo);
                          setShowRepoDropdown(false);
                        }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-accent transition-colors"
                      >
                        <svg viewBox="0 0 24 24" className="w-4 h-4 text-muted-foreground" fill="currentColor">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                        </svg>
                        <span>{repo.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Branch Selector */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowBranchDropdown(!showBranchDropdown);
                    setShowRepoDropdown(false);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
                >
                  <GitBranch className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{selectedBranch}</span>
                  <ChevronDown className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
                </button>

                {showBranchDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50">
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
                <div className="flex items-center justify-end px-4 pb-3">
                  <button
                    disabled={!input.trim() || submitting}
                    onClick={handleSubmit}
                    className="flex items-center gap-2 px-5 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-primary hover:text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm font-medium"
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
