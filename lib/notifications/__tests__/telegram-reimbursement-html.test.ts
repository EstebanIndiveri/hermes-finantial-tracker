import { buildReimbursementPaidNotification } from "../telegram";

it("escapes the payer name before storing a Telegram HTML reimbursement notice", () => {
  const message = buildReimbursementPaidNotification("<Sabri & Co>", 2500);
  expect(message.text).toContain("&lt;Sabri &amp; Co&gt; te ha pagado");
  expect(message.text).not.toContain("<Sabri & Co>");
});
