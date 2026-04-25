"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FileCode, X, FileText } from "lucide-react";

interface Tab {
  id: string;
  name: string;
  language: string;
  content: string;
}

const defaultTabs: Tab[] = [
  {
    id: "1",
    name: "main.go",
    language: "go",
    content: `package main

import (
	"fmt"
	"net/http"
)

func main() {
	fmt.Println("Hello, Instant Coding!")

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Welcome to Instant Coding")
	})

	http.ListenAndServe(":8080", mux)
}`,
  },
  {
    id: "2",
    name: "README.md",
    language: "markdown",
    content: `# Instant Coding

基于 Vercel 的网页版智能编程工具。

## Features

- AI 辅助编程
- 实时代码执行
- GitHub 集成
- 多环境支持

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`
`,
  },
];

export function CodeEditor() {
  const [tabs, setTabs] = useState<Tab[]>(defaultTabs);
  const [activeTab, setActiveTab] = useState("1");
  const [lineNumbers, setLineNumbers] = useState(true);

  const activeTabData = tabs.find((t) => t.id === activeTab);

  const lines = activeTabData?.content.split("\n") || [];

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden">
      {/* Tab Bar */}
      <div className="flex items-center border-b border-border bg-muted/50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm border-r border-border transition-colors",
              activeTab === tab.id
                ? "bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {tab.language === "markdown" ? (
              <FileText className="w-3.5 h-3.5" />
            ) : (
              <FileCode className="w-3.5 h-3.5" />
            )}
            <span>{tab.name}</span>
            <X
              className="w-3 h-3 ml-2 opacity-0 group-hover:opacity-100 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                setTabs(tabs.filter((t) => t.id !== tab.id));
                if (activeTab === tab.id && tabs.length > 1) {
                  setActiveTab(tabs.find((t) => t.id !== tab.id)?.id || "");
                }
              }}
            />
          </button>
        ))}
      </div>

      {/* Editor Area */}
      <div className="flex-1 overflow-auto">
        <div className="flex min-h-full">
          {/* Line Numbers */}
          {lineNumbers && (
            <div className="flex-shrink-0 w-12 py-4 text-right bg-muted/30 border-r border-border select-none">
              {lines.map((_, i) => (
                <div
                  key={i}
                  className="px-2 text-xs text-muted-foreground leading-6"
                >
                  {i + 1}
                </div>
              ))}
            </div>
          )}

          {/* Code Content */}
          <div className="flex-1 py-4 px-4">
            {lines.map((line, i) => (
              <div key={i} className="leading-6 text-sm font-mono">
                {line || " "}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 text-xs text-muted-foreground border-t border-border bg-muted/30">
        <div className="flex items-center gap-4">
          <span>{activeTabData?.language.toUpperCase()}</span>
          <span>UTF-8</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Ln {lines.length}, Col 1</span>
          <span>Spaces: 4</span>
        </div>
      </div>
    </div>
  );
}
