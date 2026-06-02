import { db } from "@/lib/db/client";
import { groups, group_members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const MAX_OWNED_GROUPS = 2;

export type GroupRole = "owner" | "admin" | "member";

export interface GroupMembership {
  group_id: string;
  user_id: string;
  role: GroupRole;
}

/**
 * Verifica que el usuario es miembro del grupo. Devuelve la membresía o null.
 */
export async function getGroupMembership(
  userId: string,
  groupId: string
): Promise<GroupMembership | null> {
  const member = await db.query.group_members.findFirst({
    where: and(
      eq(group_members.group_id, groupId),
      eq(group_members.user_id, userId)
    ),
  });
  if (!member) return null;
  return {
    group_id: member.group_id,
    user_id: member.user_id,
    role: member.role as GroupRole,
  };
}

/**
 * Devuelve el grupo personal del usuario (primer grupo donde es owner).
 * Retorna null si el usuario aún no tiene grupo personal.
 */
export async function getPersonalGroup(userId: string): Promise<string | null> {
  const membership = await db.query.group_members.findFirst({
    where: and(
      eq(group_members.user_id, userId),
      eq(group_members.role, "owner")
    ),
  });
  return membership?.group_id ?? null;
}

/**
 * Devuelve todos los grupos del usuario (owned + member).
 */
export async function getUserGroups(userId: string) {
  const memberships = await db.query.group_members.findMany({
    where: eq(group_members.user_id, userId),
    with: { group: true },
  });
  return memberships.map(m => ({
    group_id: m.group_id,
    role: m.role as GroupRole,
    group: m.group,
  }));
}

/**
 * Cuenta los grupos donde el usuario es owner.
 */
export async function countOwnedGroups(userId: string): Promise<number> {
  const rows = await db.query.group_members.findMany({
    where: and(
      eq(group_members.user_id, userId),
      eq(group_members.role, "owner")
    ),
  });
  return rows.length;
}

export function canManageMembers(role: GroupRole): boolean {
  return role === "owner" || role === "admin";
}

export function canEditGroupData(role: GroupRole): boolean {
  return role === "owner" || role === "admin";
}

export function canDeleteOthersData(role: GroupRole): boolean {
  return role === "owner" || role === "admin";
}

export function isOwner(role: GroupRole): boolean {
  return role === "owner";
}
