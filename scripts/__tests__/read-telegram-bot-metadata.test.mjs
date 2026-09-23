import test from "node:test";
import assert from "node:assert/strict";
import { parseTokenInput, readTelegramBotMetadata } from "../read-telegram-bot-metadata.mjs";

test("accepts a single token line and strips one terminal newline", () => {
  assert.equal(parseTokenInput("123:secret\n"), "123:secret");
  assert.equal(parseTokenInput("123:secret\r\n"), "123:secret");
  assert.equal(parseTokenInput("123:secret"), "123:secret");
});

test("rejects empty, malformed and multiline stdin", () => {
  for (const input of ["", "\n", "a\nb", "a\n\n", "token", `1:${"x".repeat(512)}`]) {
    assert.throws(() => parseTokenInput(input), /one valid bot token line/);
  }
});

test("calls only getMe and getWebhookInfo and returns the whitelist", async () => {
  const calls = [];
  const responses = [
    { ok: true, result: { id: 123456789, username: "HermesBot", first_name: "ignored" } },
    { ok: true, result: { url: "https://example.test/api/telegram/webhook", pending_update_count: 4 } },
  ];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => responses.shift() };
  };

  assert.deepEqual(await readTelegramBotMetadata("123:secret", fetchMock), {
    botId: "123456789",
    username: "HermesBot",
    webhookUrl: "https://example.test/api/telegram/webhook",
  });
  assert.deepEqual(calls.map(({ url }) => url.split("/").at(-1)), ["getMe", "getWebhookInfo"]);
  assert.ok(calls.every(({ options }) => options.method === "GET"));
});

test("does not expose tokens or raw URLs in lookup and validation errors", async () => {
  const token = "123:do-not-print";
  const rawUrl = "https://private.example.test/secret-path";
  await assert.rejects(
    readTelegramBotMetadata(token, async () => { throw new Error(`${token} ${rawUrl}`); }),
    (error) => !error.message.includes(token) && !error.message.includes(rawUrl),
  );
  await assert.rejects(
    readTelegramBotMetadata(token, async () => ({ ok: true, json: async () => ({ ok: true, result: { id: 1, username: "Bot" } }) })),
    (error) => !error.message.includes(token) && !error.message.includes(rawUrl),
  );
});

test("rejects malformed Telegram identity responses", async () => {
  await assert.rejects(readTelegramBotMetadata("token", async () => ({
    ok: true,
    json: async () => ({ ok: true, result: { id: "12", username: "Bot" } }),
  })), /invalid bot metadata/);
});

test("does not display webhook URLs with secret-bearing query or noncanonical paths", async () => {
  for (const url of ["https://example.test/api/telegram/webhook?secret=hidden", "https://example.test/private-token/hook"]) {
    const responses = [
      { ok: true, result: { id: 123, username: "HermesBot" } },
      { ok: true, result: { url } },
    ];
    await assert.rejects(
      readTelegramBotMetadata("123:secret", async () => ({ ok: true, json: async () => responses.shift() })),
      (error) => error.message === "Webhook URL is not safe to display." && !error.message.includes(url),
    );
  }
});
