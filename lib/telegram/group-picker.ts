import type { InlineKeyboardMarkup } from "./send-message";

export interface GroupPickerEntry {
  group_id: string;
  role: string;
  group: {
    id: string;
    name: string;
    owner?: { name?: string | null; username?: string | null } | null;
  };
}

/** The callback carries the group ID; users never need to copy or type it. */
export function buildGroupPicker(groups: GroupPickerEntry[], activeGroupId: string | null): {
  text: string;
  replyMarkup: InlineKeyboardMarkup;
} {
  const baseLabels = groups.map(({ group, role }) => {
    const name = group.name.trim().slice(0, 40) || "Sin nombre";
    const owner = group.owner?.username
      ? `@${group.owner.username}`
      : group.owner?.name?.trim() || "otro usuario";
    return `${name} · ${role === "owner" ? "propio" : `de ${owner}`}`;
  });
  const seen = new Map<string, number>();
  const totals = new Map<string, number>();
  for (const label of baseLabels) {
    const key = label.toLocaleLowerCase();
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  const inline_keyboard = groups.map((entry, index) => {
    const baseLabel = baseLabels[index];
    const key = baseLabel.toLocaleLowerCase();
    const number = (seen.get(key) ?? 0) + 1;
    seen.set(key, number);
    const suffix = (totals.get(key) ?? 0) > 1 ? ` · ${number}` : "";
    const active = entry.group.id === activeGroupId ? "✓ " : "";
    return [{
      text: `${active}${baseLabel}${suffix}`,
      callback_data: `group:select:${entry.group.id}`,
    }];
  });
  return {
    text: "📋 <b>Tus grupos</b>\n\nTocá un grupo para activarlo. ✓ indica el actual.",
    replyMarkup: { inline_keyboard },
  };
}
