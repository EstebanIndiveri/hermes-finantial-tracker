import { buildReimbursementCancelledNotification, buildReimbursementPaidNotification, buildReimbursementRequestNotification } from "../telegram";

it("escapes the payer name before storing a Telegram HTML reimbursement notice", () => {
  const message = buildReimbursementPaidNotification("<Sabri & Co>", 2500);
  expect(message.text).toContain("&lt;Sabri &amp; Co&gt; te ha pagado");
  expect(message.text).not.toContain("<Sabri & Co>");
});

it("escapes user-supplied fields in the Telegram HTML reimbursement request", () => {
  const message = buildReimbursementRequestNotification({
    requesterName: "<Esteban>",
    amount: 2500,
    categoryName: "Super & mercado",
    description: "<Cordiez>",
    reimbursementId: "request-1",
    paymentMethod: "alias",
    paymentValue: "cbu<&>",
  });
  expect(message.text).toContain("&lt;Esteban&gt;");
  expect(message.text).toContain("Super &amp; mercado");
  expect(message.text).toContain("&lt;Cordiez&gt;");
  expect(message.text).toContain("cbu&lt;&amp;&gt;");
});

it("escapes the requester name in a reimbursement cancellation notice", () => {
  const message = buildReimbursementCancelledNotification("<Esteban & Co>", 1);
  expect(message.text).toContain("&lt;Esteban &amp; Co&gt; canceló");
  expect(message.text).not.toContain("<Esteban & Co>");
});
