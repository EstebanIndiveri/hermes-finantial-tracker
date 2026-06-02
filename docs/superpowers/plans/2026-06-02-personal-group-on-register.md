# Personal Group on Registration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-create a personal group `"Mi espacio"` (owner) for every new user at registration, so users always have a usable dashboard even after being removed from an invited group.

**Architecture:** The change lives entirely in `POST /api/auth/register`. After inserting the user row, two DB inserts are added: one for the `groups` table, one for `group_members`. The session response also sets the `active_group_id` cookie to the new personal group so the user lands on a working dashboard immediately.

**Tech Stack:** Next.js App Router, Drizzle ORM, Turso/libsql, Jest

---

## File map

| File | Action |
|------|--------|
| `app/api/auth/register/route.ts` | Modify — add group + member inserts after user insert; set `active_group_id` cookie |
| `app/api/auth/register/__tests__/route.test.ts` | Modify — update mock for `db.insert`, add personal group assertions |

---

### Task 1: Update register route to create personal group

**Files:**
- Modify: `app/api/auth/register/route.ts`

- [ ] **Step 1: Add `groups` and `group_members` imports**

At the top of `app/api/auth/register/route.ts`, add `groups` and `group_members` to the schema import:

```typescript
import { users, group_invitations, groups, group_members } from "@/lib/db/schema";
```

- [ ] **Step 2: Add personal group creation after user insert**

Replace the block from `const sessionValue = ...` onward with:

```typescript
    const groupId = randomUUID();
    await db.insert(groups).values({
      id: groupId,
      name: "Mi espacio",
      owner_id: userId,
    });
    await db.insert(group_members).values({
      group_id: groupId,
      user_id: userId,
      role: "owner",
    });

    const sessionValue = await signSession(userId);
    const res = NextResponse.json({ user_id: userId, group_id: invitation.group_id });
    res.cookies.set("hermes_session", sessionValue, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    res.cookies.set("active_group_id", groupId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
```

Note: `active_group_id` is set to the personal group. The join flow (`POST /api/join/[token]`) later calls `POST /api/groups/active` which overwrites it with the invited group — keeping the correct UX (user onboards in the invited group context).

- [ ] **Step 3: Run the existing tests to confirm they still pass**

```bash
cd hermes-finantial-tracker && npx jest app/api/auth/register
```

Expected: some tests fail (the `db.insert` mock needs updating — covered in Task 2).

---

### Task 2: Update register tests

**Files:**
- Modify: `app/api/auth/register/__tests__/route.test.ts`

- [ ] **Step 1: Update the `db` mock to support chained `.insert().values()` for multiple tables**

Replace the top-level mock:

```typescript
jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      group_invitations: { findFirst: jest.fn() },
      users: { findFirst: jest.fn() },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));
```

This already allows `db.insert(anything).values(anything)` to resolve — no change needed to the mock structure. The existing mock already covers multiple calls to `db.insert`.

- [ ] **Step 2: Add test — personal group is created on successful registration**

Add this test inside the `describe` block:

```typescript
it("creates a personal group and sets active_group_id cookie on valid input", async () => {
  jest.mocked(db.query.group_invitations.findFirst).mockResolvedValue(validInvite as any);
  jest.mocked(db.query.users.findFirst).mockResolvedValue(undefined);

  const res = await POST(makeReq({
    name: "Alice",
    username: "alice",
    password: "validpass123",
    invite_token: "valid-invite-token",
  }));

  expect(res.status).toBe(200);

  // db.insert should have been called twice: once for users, once for groups, once for group_members
  expect(db.insert).toHaveBeenCalledTimes(3);

  // The set-cookie header should contain active_group_id
  const setCookie = res.headers.get("Set-Cookie") ?? "";
  expect(setCookie).toContain("active_group_id=");
  expect(setCookie).toContain("hermes_session");
});
```

- [ ] **Step 3: Run tests and verify they pass**

```bash
npx jest app/api/auth/register
```

Expected output:
```
PASS app/api/auth/register/__tests__/route.test.ts
Tests: 8 passed, 8 total
```

- [ ] **Step 4: Run full suite to confirm no regressions**

```bash
npm test
```

Expected: all tests pass (count increases by 1).

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/register/route.ts app/api/auth/register/__tests__/route.test.ts
git commit -m "feat: auto-create personal group Mi espacio on user registration

Every new user gets a personal group on register so they always have a
usable dashboard, even after being removed from an invited group.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Backfill existing users without a personal group

**Files:** none (DB operation only)

- [ ] **Step 1: Check which users need backfill**

```bash
~/.turso/turso db shell hermes-acme "SELECT u.id, u.username FROM users u WHERE NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.user_id = u.id AND gm.role = 'owner');"
```

Expected: user `test` (id `0be75867-a014-4eed-9ba6-1d917442a39e`) appears.

- [ ] **Step 2: Create personal group for user `test`**

Generate a UUID first (any UUID works):

```bash
~/.turso/turso db shell hermes-acme "
  INSERT INTO groups (id, name, owner_id, created_at) VALUES ('$(uuidgen | tr '[:upper:]' '[:lower:]')', 'Mi espacio', '0be75867-a014-4eed-9ba6-1d917442a39e', $(date +%s)000);
"
```

Then insert the membership (replace `<new-group-id>` with the UUID used above):

```bash
~/.turso/turso db shell hermes-acme "
  INSERT INTO group_members (group_id, user_id, role, joined_at)
  VALUES ('<new-group-id>', '0be75867-a014-4eed-9ba6-1d917442a39e', 'owner', $(date +%s)000);
"
```

- [ ] **Step 3: Verify backfill**

```bash
~/.turso/turso db shell hermes-acme "
  SELECT g.id, g.name, gm.role
  FROM groups g
  JOIN group_members gm ON g.id = gm.group_id
  WHERE gm.user_id = '0be75867-a014-4eed-9ba6-1d917442a39e';
"
```

Expected: one row with `name = "Mi espacio"` and `role = "owner"`.

---

### Task 4: Deploy

- [ ] **Step 1: Deploy to production**

```bash
cd hermes-finantial-tracker && vercel --prod
```

Expected: `✓ Ready` with alias `hermes-finantial-tracker.vercel.app`.

- [ ] **Step 2: Verify end-to-end**

As user `test` (private window):
1. Log in with `test` / `4b6041247d62a2c7b9f1e5dea124aad9`
2. GroupSwitcher in sidebar should show `"Mi espacio"`
3. Dashboard loads with empty (but working) state — no "No estás en ningún grupo activo"
4. Categories page loads correctly

As `hermes_user`:
1. Send a new invite
2. Register a fresh user
3. After registration, user should land in the invited group (active_group_id = invited group)
4. Verify GroupSwitcher shows both `"Mi espacio"` AND the invited group
5. Remove the new user from the group → they should auto-switch to `"Mi espacio"` on next request
