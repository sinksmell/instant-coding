"use client";

import { useState } from "react";
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
  MoreHorizontal,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

type SettingTab = "general" | "environment" | "connector" | "chat" | "interface" | "account" | "about";

interface EnvConfig {
  id: string;
  name: string;
  repo: string;
  tasks: number;
  createdAt: string;
  user: string;
  status: "active" | "inactive";
}

const envs: EnvConfig[] = [
  {
    id: "1",
    name: "files-cmp",
    repo: "files-cmp",
    tasks: 5,
    createdAt: "2026/4/11 14:50:09",
    user: "sinksmell",
    status: "active",
  },
];

const sidebarItems: { id: SettingTab; label: string; icon: React.ReactNode; group: "coder" | "studio" }[] = [
  { id: "general", label: "通用", icon: <Settings2 className="w-4 h-4" />, group: "coder" },
  { id: "environment", label: "环境", icon: <Monitor className="w-4 h-4" />, group: "coder" },
  { id: "connector", label: "连接器", icon: <Plug className="w-4 h-4" />, group: "coder" },
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
            {activeTab === "environment" && (
              <div className="max-w-4xl">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold">环境</h2>
                  <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium">
                    <Plus className="w-4 h-4" />
                    添加环境
                  </button>
                </div>

                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-left text-sm text-muted-foreground">
                        <th className="px-6 py-3 font-medium">环境</th>
                        <th className="px-6 py-3 font-medium">仓库</th>
                        <th className="px-6 py-3 font-medium">任务</th>
                        <th className="px-6 py-3 font-medium">创建时间</th>
                        <th className="px-6 py-3 font-medium">用户账户</th>
                        <th className="px-6 py-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {envs.map((env) => (
                        <tr
                          key={env.id}
                          className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {env.status === "active" && (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                              )}
                              <span className="font-medium">{env.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm">{env.repo}</td>
                          <td className="px-6 py-4 text-sm">{env.tasks}</td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">
                            {env.createdAt}
                          </td>
                          <td className="px-6 py-4 text-sm">{env.user}</td>
                          <td className="px-6 py-4">
                            <button className="p-1 rounded hover:bg-accent transition-colors">
                              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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
