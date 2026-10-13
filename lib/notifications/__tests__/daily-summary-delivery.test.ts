import { buildDailySummaryIdentity, parseDailySummaryContext } from "../daily-summary-delivery";

describe("daily summary durable identity", () => {
  it("uses one stable operation and delivery key per bot, user and Argentina date", () => {
    const first = buildDailySummaryIdentity("beta-bot", "user-A", "2026-10-13");
    expect(buildDailySummaryIdentity("beta-bot", "user-A", "2026-10-13")).toEqual(first);
    expect(buildDailySummaryIdentity("beta-bot", "user-B", "2026-10-13").deliveryKey).not.toBe(first.deliveryKey);
    expect(buildDailySummaryIdentity("beta-bot", "user-A", "2026-10-14").deliveryKey).not.toBe(first.deliveryKey);
    expect(buildDailySummaryIdentity("other-bot", "user-A", "2026-10-13").deliveryKey).not.toBe(first.deliveryKey);
  });

  it("rejects malformed proactive metadata rather than trusting a queued recipient", () => {
    expect(parseDailySummaryContext("not json")).toBeNull();
    expect(parseDailySummaryContext('{"groupId":""}')).toBeNull();
    expect(parseDailySummaryContext('{"groupId":"group-A"}')).toEqual({ groupId: "group-A" });
  });
});
