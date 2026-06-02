# Personal Group on Registration — Design Spec

**Date:** 2026-06-02  
**Status:** Approved

## Problem

When a user registers via an invite link, they have no personal group. If the group owner later removes them, they are left with an empty dashboard and cannot use the app at all (categories crash, settings show "No estás en ningún grupo activo", dashboard shows $0 with no data).

## Solution

Every user always has a personal group `"Mi espacio"` created automatically at registration. Users can belong to multiple groups (their personal + invited groups). The existing `GroupSwitcher` UI and group infrastructure already support this — only the registration flow and a DB backfill are needed.

## Design

### 1. Registration flow (`POST /api/auth/register`)

After creating the user record, the handler must:
1. Create a group with `name = "Mi espacio"` and `owner_id = userId`
2. Insert a `group_members` row: `{ group_id, user_id, role: "owner" }`
3. Set the `active_group_id` cookie to the personal group ID in the response

This ensures every new user starts with a usable dashboard even before joining any invited group.

### 2. Join via invite flow (`POST /api/join/[token]`)

No changes needed. When a user registers via invite, the personal group is created first (step above), then the join handler adds them to the invited group and sets `active_group_id` to the invited group. They onboard into the invited group context, but their personal group exists as a fallback.

### 3. Removal from group (existing behavior — confirmed working)

The middleware already handles this: when `active_group_id` points to a group the user no longer belongs to, it clears the cookie and falls back to `getPersonalGroup()`. Since `getPersonalGroup` returns the first group where the user is `owner`, the personal `"Mi espacio"` group is found and set as active immediately — no log out required.

### 4. Group switcher UI

No changes. The `GroupSwitcher` component already fetches all groups via `GET /api/groups` and renders them as a dropdown. Users can switch between personal group and any invited groups freely. The `MAX_OWNED_GROUPS = 2` limit is already enforced.

### 5. Group name

The personal group is always named `"Mi espacio"` — generic, locale-friendly, unambiguous. The user can rename it later from the group settings page.

### 6. Backfill for existing users

User `test` (id: `0be75867-a014-4eed-9ba6-1d917442a39e`) currently has no group after being removed from "Hogar". A backfill script runs at deploy time to create a personal group for any user who has no owned group.

**Backfill logic:**
```sql
-- Find users without any owned group
SELECT u.id FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM group_members gm 
  WHERE gm.user_id = u.id AND gm.role = 'owner'
);
-- For each: create group "Mi espacio" + insert group_members row
```

The backfill is idempotent — running it multiple times is safe.

## Files changed

- `app/api/auth/register/route.ts` — Add personal group creation after user insert
- `app/api/auth/register/__tests__/route.test.ts` — Update mocks and add personal group test cases

## Out of scope

- Renaming the personal group (already supported via group settings page)
- Allowing users to own more than 2 groups (limit is already enforced)
- UI changes (GroupSwitcher already handles multi-group correctly)
- Schema changes (not needed)
