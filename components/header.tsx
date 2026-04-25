"use client";

import { useState } from "react";
import { GitBranch, GitRepo, ChevronDown, Globe, Monitor } from "lucide-react";
import Link from "next/link";

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

export function Header() {
  const [selectedRepo, setSelectedRepo] = useState(repos[0]);
  const [selectedBranch, setSelectedBranch] = useState("main");
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
      {/* Left: Repo & Branch Selectors */}
      <div className="flex items-center gap-4">
        {/* Repo Selector */}
        <div className="relative">
          <button
            onClick={() => {
              setShowRepoDropdown(!showRepoDropdown);
              setShowBranchDropdown(false);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors min-w-[200px]"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            <span className="text-sm font-medium">{selectedRepo.name}</span>
            <ChevronDown className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
          </button>

          {showRepoDropdown && (
            <div className="absolute top-full left-0 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50">
              {repos.map((repo) => (
                <button
                  key={repo.name}
                  onClick={() => {
                    setSelectedRepo(repo);
                    setShowRepoDropdown(false);
                  }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-accent transition-colors"
                >
                  <GitRepo className="w-4 h-4 text-muted-foreground" />
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
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors min-w-[160px]"
          >
            <GitBranch className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{selectedBranch}</span>
            <ChevronDown className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
          </button>

          {showBranchDropdown && (
            <div className="absolute top-full left-0 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50">
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

      {/* Right: Environment Badge */}
      <Link
        href="/settings"
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
      >
        <Monitor className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm">环境</span>
      </Link>
    </header>
  );
}
