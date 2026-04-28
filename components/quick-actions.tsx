"use client";

import { cn } from "@/lib/utils";
import {
  RefreshCw,
  FlaskConical,
  Zap,
  FileText,
  Code2,
  Sparkles,
} from "lucide-react";

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
  description: string;
}

// Prompts are short and imperative — the kind you'd actually type when an
// idea strikes. Clicking one pre-fills the hero textarea; the user tweaks
// before submitting so the agent never blindly runs canned copy.
const actions: QuickAction[] = [
  {
    id: "refactor",
    label: "重构代码",
    icon: <RefreshCw className="w-4 h-4" />,
    prompt: "帮我重构这个项目中明显可以清理的部分，保持行为不变。",
    description: "优化代码结构和可读性",
  },
  {
    id: "test",
    label: "加测试",
    icon: <FlaskConical className="w-4 h-4" />,
    prompt: "给核心函数补一下单元测试，优先覆盖边界情况。",
    description: "自动生成单元测试",
  },
  {
    id: "optimize",
    label: "优化性能",
    icon: <Zap className="w-4 h-4" />,
    prompt: "找一下这个项目里明显的性能热点并给出优化方案。",
    description: "识别性能瓶颈并优化",
  },
  {
    id: "readme",
    label: "写文档",
    icon: <FileText className="w-4 h-4" />,
    prompt: "完善 README：说明项目用途、安装、使用和主要目录结构。",
    description: "自动生成项目文档",
  },
  {
    id: "explain",
    label: "讲讲这段",
    icon: <Code2 className="w-4 h-4" />,
    prompt: "先带我过一遍这个项目的整体结构和关键代码路径。",
    description: "详细解释代码逻辑",
  },
  {
    id: "spark",
    label: "给我灵感",
    icon: <Sparkles className="w-4 h-4" />,
    prompt: "看看这个仓库，给我 3 个可以马上动手做的小改进。",
    description: "让 Claude 挑一个有用的小改进",
  },
];

export interface QuickActionsProps {
  onSelect?: (prompt: string) => void;
}

export function QuickActions({ onSelect }: QuickActionsProps) {
  return (
    <div className="flex items-center gap-2 py-3 justify-center flex-wrap">
      {actions.map((action) => (
        <button
          key={action.id}
          onClick={() => onSelect?.(action.prompt)}
          disabled={!onSelect}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card",
            "hover:bg-accent hover:border-primary/40 hover:shadow-sm",
            "active:scale-[0.97] transition-all",
            "text-sm font-medium text-foreground whitespace-nowrap",
            "disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-card disabled:hover:shadow-none disabled:active:scale-100",
          )}
          title={action.description}
        >
          <span className="text-muted-foreground">{action.icon}</span>
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}
