import { getNotificationsRuntimeMode } from "../notifications";

describe("getNotificationsRuntimeMode", () => {
  it("preserves legacy delivery when the setting is absent", () => {
    expect(getNotificationsRuntimeMode({})).toBe("enabled");
  });

  it("accepts only exact enabled and disabled values", () => {
    expect(getNotificationsRuntimeMode({ NOTIFICATIONS_ENABLED: "true" })).toBe("enabled");
    expect(getNotificationsRuntimeMode({ NOTIFICATIONS_ENABLED: "false" })).toBe("disabled");
  });

  it.each(["TRUE", "False", "1", "", " false "])(
    "fails closed for the unknown value %j",
    (value) => {
      expect(getNotificationsRuntimeMode({ NOTIFICATIONS_ENABLED: value })).toBe("invalid");
    },
  );
});
