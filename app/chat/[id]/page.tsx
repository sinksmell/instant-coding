"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  FileDiff,
  Terminal as TerminalIcon,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { AgentChat } from "@/components/agent-chat"
import { DiffPanel } from "@/components/diff-panel"
import { TerminalPanel } from "@/components/terminal-panel"
import { useTask } from "@/lib/tasks"
import { cn } from "@/lib/utils"

type RightTab = "diff" | "shell"

export default function ChatPage() {
  const params = useParams<{ id: string }>()
  const { task, loading, error } = useTask(params.id)
  const [showRight, setShowRight] = useState(true)
  const [rightTab, setRightTab] = useState<RightTab>("diff")
  const [chatSessionId, setChatSessionId] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="flex h-screen bg-background items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
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
    )
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
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
                {task.repo_owner && task.repo_name && (
                  <>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">
                      {task.repo_owner} / {task.repo_name} / {task.branch}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showRight && (
              <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg">
                <TabBtn active={rightTab === "diff"} onClick={() => setRightTab("diff")} icon={FileDiff}>
                  Diff
                </TabBtn>
                <TabBtn active={rightTab === "shell"} onClick={() => setRightTab("shell")} icon={TerminalIcon}>
                  Shell
                </TabBtn>
              </div>
            )}
            <button
              onClick={() => setShowRight((v) => !v)}
              className="p-2 rounded-lg border border-border hover:bg-accent transition-colors"
              title={showRight ? "隐藏右侧面板" : "显示右侧面板"}
            >
              {showRight ? (
                <PanelRightClose className="w-4 h-4" />
              ) : (
                <PanelRightOpen className="w-4 h-4" />
              )}
            </button>
            {task.pr_url && (
              <Link
                href={task.pr_url}
                target="_blank"
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                查看 PR
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <div className={showRight ? "flex-1 border-r border-border overflow-hidden" : "flex-1 overflow-hidden"}>
            <AgentChat
              taskId={task.id}
              initialPrompt={task.description}
              onSessionIdChange={setChatSessionId}
            />
          </div>
          {showRight && (
            <div className="w-[560px] overflow-hidden">
              {/*
                Both panels are kept mounted so switching tabs preserves their
                state (WS connections, terminal scroll, diff selection).
              */}
              <div className={cn("h-full", rightTab !== "diff" && "hidden")}>
                <DiffPanel taskId={task.id} baseBranch={task.branch || "main"} />
              </div>
              <div className={cn("h-full", rightTab !== "shell" && "hidden")}>
                <TerminalPanel taskId={task.id} claudeSessionId={chatSessionId} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: typeof FileDiff
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {children}
    </button>
  )
}
