#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const API_BASE = "https://api.telegram.org/bot";

export function parseTokenInput(input) {
  const token = input.endsWith("\n") ? input.slice(0, -1).replace(/\r$/, "") : input;
  if (token.length > 512 || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("Expected exactly one valid bot token line on stdin.");
  }
  return token;
}

async function telegramRead(token, method, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(`${API_BASE}${token}/${method}`, { method: "GET" });
    const body = await response.json();
    if (!response.ok || body?.ok !== true || !body.result || typeof body.result !== "object") {
      throw new Error("Telegram returned an invalid response.");
    }
    return body.result;
  } catch {
    throw new Error("Telegram metadata lookup failed.");
  }
}

export async function readTelegramBotMetadata(token, fetchImpl = fetch) {
  const me = await telegramRead(token, "getMe", fetchImpl);
  const webhook = await telegramRead(token, "getWebhookInfo", fetchImpl);
  if (!Number.isSafeInteger(me.id) || me.id <= 0 || typeof me.username !== "string" || !me.username || typeof webhook.url !== "string") {
    throw new Error("Telegram returned invalid bot metadata.");
  }
  if (webhook.url) {
    let url;
    try {
      url = new URL(webhook.url);
    } catch {
      throw new Error("Webhook URL is not safe to display.");
    }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api/telegram/webhook") {
      throw new Error("Webhook URL is not safe to display.");
    }
  }
  return { botId: String(me.id), username: me.username, webhookUrl: webhook.url };
}

async function main() {
  if (process.argv.length !== 2) throw new Error("Do not pass arguments; provide the token through stdin.");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const token = parseTokenInput(input);
  const metadata = await readTelegramBotMetadata(token);
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Metadata lookup failed."}\n`);
    process.exitCode = 1;
  });
}
