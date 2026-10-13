import { outboxActivityHeader } from "../outbox-activity";

it("formats only bounded, internally consistent aggregate counts", () => {
  expect(outboxActivityHeader({ claimed: 2, sent: 1, retryable: 1, dead: 0, lostLease: 0 }))
    .toBe("2,1,1,0,0");
  expect(outboxActivityHeader({ claimed: 0, sent: 0, retryable: 0, dead: 0, lostLease: 0 }))
    .toBe("0,0,0,0,0");
  expect(outboxActivityHeader({ claimed: 1, sent: 1, retryable: 1, dead: 0, lostLease: 0 }))
    .toBeNull();
  expect(outboxActivityHeader({ claimed: 26, sent: 0, retryable: 0, dead: 0, lostLease: 0 }))
    .toBeNull();
  expect(outboxActivityHeader({ claimed: 1, sent: -1, retryable: 0, dead: 0, lostLease: 0 }))
    .toBeNull();
  expect(outboxActivityHeader({ claimed: 1, sent: Number.NaN, retryable: 0, dead: 0, lostLease: 0 }))
    .toBeNull();
});
