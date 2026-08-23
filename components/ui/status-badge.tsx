"use client";

import { getArgentinaDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

type StatusType = "pending" | "due_today" | "overdue" | "paid";

interface StatusBadgeProps {
  status: StatusType;
  daysOverdue?: number;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; emoji: string; className: string }> = {
  pending: {
    label: "Pendiente",
    emoji: "⏳",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  due_today: {
    label: "Vence hoy",
    emoji: "⚠️",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
  overdue: {
    label: "Vencido",
    emoji: "🚨",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  paid: {
    label: "Pagado",
    emoji: "✅",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
};

export function StatusBadge({ status, daysOverdue, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  let label = config.label;
  if (status === "overdue" && daysOverdue) {
    label = `Vencido (${daysOverdue} día${daysOverdue === 1 ? "" : "s"})`;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        config.className,
        className
      )}
    >
      <span>{config.emoji}</span>
      <span>{label}</span>
    </span>
  );
}

export function getExecutionStatus(
  scheduledDate: string,
  executionStatus: "pending" | "executed" | "skipped"
): { status: StatusType; daysOverdue?: number } {
  if (executionStatus === "executed") {
    return { status: "paid" };
  }

  const today = getArgentinaDate();
  today.setHours(0, 0, 0, 0);
  const scheduled = new Date(`${scheduledDate}T00:00:00`);
  scheduled.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((scheduled.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { status: "overdue", daysOverdue: Math.abs(diffDays) };
  } else if (diffDays === 0) {
    return { status: "due_today" };
  } else {
    return { status: "pending" };
  }
}
