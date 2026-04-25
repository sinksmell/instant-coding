"use client";

import { cn } from "@/lib/utils";
import {
  RefreshCw,
  FlaskConical,
  Zap,
  FileText,
  MoreHorizontal,
  Code2,
} from "lucide-react";

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const actions: QuickAction[] = [
  {
    id: "refactor",
    label: "重构代码",
    icon: <RefreshCw className="w-4 h-4" />,
    description: "优化代码结构和可读性",
  },
  {
    id: "test",
    label: "生成测试",
    icon: <FlaskConical className="w-4 h-4" />,
    description: "自动生成单元测试",
  },
  {
    id: "optimize",
    label: "优化性能",
    icon: <Zap className="w-4 h-4" />,
    description: "识别性能瓶颈并优化",
  },
  {
    id: "readme",
    label: "生成文档",
    icon: <FileText className="w-4 h-4" />,
    description: "自动生成项目文档",
  },
  {
    id: "explain",
    label: "解释代码",
    icon: <Code2 className="w-4 h-4" />,
    description: "详细解释代码逻辑",
  },
  {
    id: "more",
    label: "更多",
    icon: <MoreHorizontal className="w-4 h-4" />,
    description: "查看更多功能",
  },
];

export function QuickActions() {
  return (
    <div className="flex items-center gap-2 py-3 justify-center flex-wrap">
      {actions.map((action) => (
        <button
          key={action.id}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card",
            "hover:bg-accent hover:border-primary/30 transition-all",
            "text-sm font-medium text-foreground whitespace-nowrap"
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
