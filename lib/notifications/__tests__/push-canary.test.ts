import { isPushCanaryConfigured, isPushCanaryEnabled, isPushCanaryTarget } from "../push-canary";

const originalGroup = process.env.WEB_PUSH_CANARY_GROUP_ID;
const originalUsers = process.env.WEB_PUSH_CANARY_USER_IDS;
const originalPush = process.env.WEB_PUSH_ENABLED;
const originalNotifications = process.env.NOTIFICATIONS_ENABLED;

afterEach(() => {
  if (originalGroup === undefined) delete process.env.WEB_PUSH_CANARY_GROUP_ID;
  else process.env.WEB_PUSH_CANARY_GROUP_ID = originalGroup;
  if (originalUsers === undefined) delete process.env.WEB_PUSH_CANARY_USER_IDS;
  else process.env.WEB_PUSH_CANARY_USER_IDS = originalUsers;
  if (originalPush === undefined) delete process.env.WEB_PUSH_ENABLED;
  else process.env.WEB_PUSH_ENABLED = originalPush;
  if (originalNotifications === undefined) delete process.env.NOTIFICATIONS_ENABLED;
  else process.env.NOTIFICATIONS_ENABLED = originalNotifications;
});

it("enables only the scoped beta push lane while broad notifications stay off", () => {
  process.env.WEB_PUSH_CANARY_GROUP_ID = "group-beta";
  process.env.WEB_PUSH_CANARY_USER_IDS = "user-a,user-b";
  process.env.WEB_PUSH_ENABLED = "true";
  process.env.NOTIFICATIONS_ENABLED = "false";
  expect(isPushCanaryEnabled()).toBe(true);
  process.env.NOTIFICATIONS_ENABLED = "true";
  expect(isPushCanaryEnabled()).toBe(false);
  process.env.NOTIFICATIONS_ENABLED = "invalid";
  expect(isPushCanaryEnabled()).toBe(false);
  process.env.NOTIFICATIONS_ENABLED = "false";
  process.env.WEB_PUSH_ENABLED = "false";
  expect(isPushCanaryEnabled()).toBe(false);
});

it("accepts exactly the configured group and named recipients", () => {
  process.env.WEB_PUSH_CANARY_GROUP_ID = "group-beta";
  process.env.WEB_PUSH_CANARY_USER_IDS = "user-a,user-b";

  expect(isPushCanaryConfigured()).toBe(true);
  expect(isPushCanaryTarget("group-beta", "user-a")).toBe(true);
  expect(isPushCanaryTarget("group-beta", "user-b")).toBe(true);
  expect(isPushCanaryTarget("group-other", "user-a")).toBe(false);
  expect(isPushCanaryTarget("group-beta", "user-other")).toBe(false);
});

it.each([
  ["missing group", undefined, "user-a"],
  ["missing users", "group-beta", undefined],
  ["blank user entry", "group-beta", "user-a, ,user-b"],
  ["duplicate user entry", "group-beta", "user-a,user-a"],
] as const)("fails closed for %s", (_label, group, users) => {
  if (group === undefined) delete process.env.WEB_PUSH_CANARY_GROUP_ID;
  else process.env.WEB_PUSH_CANARY_GROUP_ID = group;
  if (users === undefined) delete process.env.WEB_PUSH_CANARY_USER_IDS;
  else process.env.WEB_PUSH_CANARY_USER_IDS = users;

  expect(isPushCanaryConfigured()).toBe(false);
  expect(isPushCanaryTarget("group-beta", "user-a")).toBe(false);
});
