import { and, eq } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { LibSQLTransaction } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";
import { telegram_operations } from "@/lib/db/schema";
import type { TelegramOperationIdentity } from "./operation-context";

export type TelegramOperationTransaction = LibSQLTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type TelegramOperationTransactionRunner = <T>(
  work: (transaction: TelegramOperationTransaction) => Promise<T>,
) => Promise<T>;

export type TelegramOperationClaim<TResult = unknown> =
  | { kind: "acquired"; operationId: string }
  | {
      kind: "committed";
      operationId: string;
      resourceType: string | null;
      resourceId: string | null;
      result: TResult;
    }
  | { kind: "busy"; operationId: string };

export interface TelegramOperationInput {
  identity: TelegramOperationIdentity;
  botId: string;
  updateId: string;
  operationKind: string;
  now?: number;
}

export interface TelegramOperationWrite<TResult> {
  resourceType: string | null;
  resourceId: string | null;
  result: TResult;
}

export type TelegramOperationRunResult<TResult> =
  | {
      kind: "committed";
      operationId: string;
      resourceType: string | null;
      resourceId: string | null;
      result: TResult;
      reused: boolean;
    }
  | { kind: "busy"; operationId: string };

const MAX_DATABASE_BUSY_ATTEMPTS = 8;
const localOperationTails = new Map<string, Promise<void>>();

function isDatabaseBusy(error: unknown): boolean {
  let candidate: unknown = error;
  for (let depth = 0; depth < 3 && candidate && typeof candidate === "object"; depth += 1) {
    const record = candidate as { code?: unknown; cause?: unknown };
    if (record.code === "SQLITE_BUSY") return true;
    candidate = record.cause;
  }
  return false;
}

function waitForRetry(attempt: number): Promise<void> {
  const delayMs = Math.min(100, 5 * 2 ** attempt);
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function withLocalOperationLock<T>(operationId: string, work: () => Promise<T>): Promise<T> {
  const previous = localOperationTails.get(operationId) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const current = new Promise<void>((resolve) => { release = resolve; });
  localOperationTails.set(operationId, current);
  await previous;
  try {
    return await work();
  } finally {
    release?.();
    if (localOperationTails.get(operationId) === current) localOperationTails.delete(operationId);
  }
}

function validateToken(name: string, value: string, maxLength: number): string {
  if (!value || value.length > maxLength || value.includes("\u0000") || /[\r\n]/.test(value)) {
    throw new Error(`Invalid Telegram operation ${name}`);
  }
  return value;
}

function readResult<TResult>(encoded: string | null): TResult {
  if (encoded == null) throw new Error("Committed Telegram operation has no result");
  return JSON.parse(encoded) as TResult;
}

/** Claims an operation inside the same database transaction as its writer. */
export async function claimTelegramOperation<TResult = unknown>(
  transaction: TelegramOperationTransaction,
  input: TelegramOperationInput,
): Promise<TelegramOperationClaim<TResult>> {
  const operationId = validateToken("operationId", input.identity.operationId, 80);
  const botId = validateToken("botId", input.botId, 64);
  const updateId = validateToken("updateId", input.updateId, 64);
  validateToken("deliveryKey", input.identity.deliveryKey, 80);
  const operationKind = validateToken("operationKind", input.operationKind, 96);
  const now = input.now ?? Date.now();

  const inserted = await transaction
    .insert(telegram_operations)
    .values({
      operation_id: operationId,
      bot_id: botId,
      update_id: updateId,
      operation_kind: operationKind,
      status: "started",
      created_at: now,
      updated_at: now,
    })
    .onConflictDoNothing()
    .returning({ operationId: telegram_operations.operation_id });
  if (inserted.length === 1) return { kind: "acquired", operationId };

  const [existing] = await transaction
    .select({
      operationId: telegram_operations.operation_id,
      status: telegram_operations.status,
      resourceType: telegram_operations.resource_type,
      resourceId: telegram_operations.resource_id,
      resultJson: telegram_operations.result_json,
    })
    .from(telegram_operations)
    .where(and(
      eq(telegram_operations.bot_id, botId),
      eq(telegram_operations.update_id, updateId),
      eq(telegram_operations.operation_kind, operationKind),
    ))
    .limit(1);

  if (!existing || existing.operationId !== operationId) {
    throw new Error("Telegram operation identity conflict");
  }
  if (existing.status === "committed") {
    return {
      kind: "committed",
      operationId,
      resourceType: existing.resourceType,
      resourceId: existing.resourceId,
      result: readResult<TResult>(existing.resultJson),
    };
  }
  return { kind: "busy", operationId };
}

export async function commitTelegramOperation<TResult>(
  transaction: TelegramOperationTransaction,
  input: TelegramOperationInput,
  operation: TelegramOperationWrite<TResult>,
): Promise<void> {
  const operationId = validateToken("operationId", input.identity.operationId, 80);
  const resultJson = JSON.stringify(operation.result);
  if (resultJson === undefined) throw new Error("Telegram operation result must be JSON serializable");
  if (operation.resourceType != null) validateToken("resourceType", operation.resourceType, 96);
  if (operation.resourceId != null) validateToken("resourceId", operation.resourceId, 128);
  const now = input.now ?? Date.now();

  const changed = await transaction
    .update(telegram_operations)
    .set({
      status: "committed",
      resource_type: operation.resourceType,
      resource_id: operation.resourceId,
      result_json: resultJson,
      updated_at: now,
      committed_at: now,
    })
    .where(and(
      eq(telegram_operations.operation_id, operationId),
      eq(telegram_operations.status, "started"),
    ))
    .returning({ operationId: telegram_operations.operation_id });
  if (changed.length !== 1) throw new Error("Telegram operation was not owned by this writer");
}

export async function runTelegramOperation<TResult>(
  runner: TelegramOperationTransactionRunner,
  input: TelegramOperationInput,
  writer: (transaction: TelegramOperationTransaction) => Promise<TelegramOperationWrite<TResult>>,
): Promise<TelegramOperationRunResult<TResult>> {
  return withLocalOperationLock(input.identity.operationId, async () => {
    for (let attempt = 0; attempt < MAX_DATABASE_BUSY_ATTEMPTS; attempt += 1) {
      try {
        return await runner(async (transaction) => {
          const claim = await claimTelegramOperation<TResult>(transaction, input);
          if (claim.kind === "busy") return claim;
          if (claim.kind === "committed") return { ...claim, reused: true };

          const written = await writer(transaction);
          await commitTelegramOperation(transaction, input, written);
          return {
            kind: "committed",
            operationId: claim.operationId,
            resourceType: written.resourceType,
            resourceId: written.resourceId,
            result: written.result,
            reused: false,
          };
        });
      } catch (error) {
        if (!isDatabaseBusy(error) || attempt === MAX_DATABASE_BUSY_ATTEMPTS - 1) throw error;
        await waitForRetry(attempt);
      }
    }
    throw new Error("Telegram operation retry loop exhausted");
  });
}
