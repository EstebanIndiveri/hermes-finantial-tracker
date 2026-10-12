/** Escape untrusted text inserted into Telegram messages sent with parse_mode=HTML. */
export function escapeTelegramHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[character] ?? character));
}
