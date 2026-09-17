/* Offline audit probes. Run from repository root with Node >=22.
 * Loads current source with TypeScript transpilation and explicit dependency mocks.
 * No database, credentials, network, or production changes are used.
 * This is evidence for the audit, not a replacement for integration tests.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

function load(relative, mocks = {}) {
  const filename = path.join(root, relative);
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks);
    if (name.startsWith('.')) {
      return load(path.relative(root, path.resolve(path.dirname(filename), name)) + '.ts', mocks);
    }
    return require(name);
  };
  vm.runInThisContext('(function(require,module,exports){' + js + '\n})', { filename })(localRequire, module, module.exports);
  return module.exports;
}

async function main() {
  const fallback = load('lib/telegram/expense-fallback.ts');
  const amounts = [
    ['gasté 1.234,56 en super', 1234.56],
    ['gasté mil quinientos en super', 1500],
    ['gasté treinta y cinco mil en super', 35000],
    ['compré 2 kilos por 5000 en super', 5000],
    ['no gasté 5000 en supermercado', null],
    ['puedo gastar 5000 en supermercado?', null],
    ['cobré 50000 por venta de ropa', 'ingresos'],
  ].map(([input, expected]) => ({ input, expected, actual: fallback.parseExpenseFallback(input) }));
  const receipt = load('lib/ai/parse-receipt.ts', { './groq': { getGroqClient: () => null } });
  const receipts = [];
  for (const [input, expected] of [
    ['SUBTOTAL 1000\nDESCUENTO 100\nTOTAL 900', 900],
    ['TICKET 123456\nGRACIAS POR SU COMPRA', null],
  ]) receipts.push({ input, expected, actual: await receipt.parseReceiptText(input) });

  const schema = load('lib/db/schema.ts');
  const mockDb = {
    query: {
      split_sessions: { findMany: async () => [{ id: 'session', name: 'Tres personas' }] },
      splits: { findMany: async () => [{ id: 'split' }] },
    },
    select() {
      let table;
      return {
        from(t) { table = t; return this; },
        innerJoin() { return this; },
        async where() {
          if (table === schema.split_payers) return [{ user_id: 'B', temp_user_id: null, amount_paid: 100 }];
          if (table === schema.split_items) return [{ user_id: 'C', temp_user_id: null, amount_owed: 100 }];
          return [];
        },
      };
    },
  };
  const globalBalances = load('lib/splits/global-balances.ts', {
    '@/lib/db/client': { db: mockDb }, '@/lib/db/schema': schema,
  });
  const balances = await globalBalances.calculateGlobalBalances('A');

  const cronCalls = [];
  const cron = load('app/api/cron/recurring/route.ts', {
    '@/lib/db/client': { db: {} },
    '@/lib/db/recurring-queries': {
      createMonthlyExecutions: async (id) => { cronCalls.push(id); return 1; },
      getPendingExecutions: async () => [],
    },
    '@/lib/telegram/send-message': {},
  });
  const { NextRequest } = require('next/server');
  const cronResponse = await cron.GET(new NextRequest('http://localhost/api/cron/recurring?userId=fixture-user'));
  const executionCalls = [];
  const executionRoute = load('app/api/recurring-expenses/executions/[id]/route.ts', {
    '@/lib/auth/session': { verifySession: async () => 'user-A' },
    '@/lib/db/recurring-queries': {
      confirmExecution: async (...args) => { executionCalls.push(args); return { success: true, transactionId: 'fixture-tx' }; },
    },
  });
  const executionResponse = await executionRoute.POST(new NextRequest('http://localhost/api/recurring-expenses/executions/owned-by-B?action=confirm', {
    method: 'POST', headers: { cookie: 'hermes_session=fixture' }, body: '{}',
  }), { params: Promise.resolve({ id: 'owned-by-B' }) });
  const voiceCalls = [];
  const webhook = load('app/api/telegram/webhook/route.ts', {
    '@/lib/db/client': { db: { query: { users: { findFirst: async () => ({ id: 'user-A', active_telegram_group_id: 'personal-group-A' }) } } } },
    '@/lib/telegram/send-message': { sendTelegramMessage: async () => {} },
    '@/lib/telegram/handlers': { handleTelegramMessage: async (update, user, group) => { voiceCalls.push({ chatType: update.message.chat.type, user, group }); return { text: 'fixture' }; } },
    '@/lib/groups/permissions': {}, '@/lib/telegram/splits/handler': {},
    '@/lib/telegram/splits/telegram-api': {}, '@/lib/telegram/personal-callback-handler': {},
    '@/lib/telegram/voice': { transcribeVoiceMessage: async () => 'gasté 1000 en super' },
  });
  const previousSecret = process.env.TELEGRAM_SECRET_TOKEN;
  process.env.TELEGRAM_SECRET_TOKEN = 'offline-audit-fixture';
  try {
    for (let i = 0; i < 2; i++) await webhook.POST(new NextRequest('http://localhost/api/telegram/webhook', {
      method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'offline-audit-fixture' },
      body: JSON.stringify({ update_id: 42, message: { from: { id: 1 }, chat: { id: -123, type: 'supergroup' }, voice: { file_id: 'fixture' } } }),
    }));
  } finally {
    if (previousSecret === undefined) delete process.env.TELEGRAM_SECRET_TOKEN;
    else process.env.TELEGRAM_SECRET_TOKEN = previousSecret;
  }
  const { createClient } = require('@libsql/client');
  const { drizzle } = require('drizzle-orm/libsql');
  const { migrate } = require('drizzle-orm/libsql/migrator');
  const memoryClient = createClient({ url: 'file::memory:' });
  let migrationEvidence;
  try {
    await migrate(drizzle(memoryClient), { migrationsFolder: path.join(root, 'lib/db/migrations') });
    const tables = await memoryClient.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    migrationEvidence = { tables: tables.rows.map((row) => row.name) };
  } catch (error) {
    migrationEvidence = { error: error.message };
  } finally { memoryClient.close(); }
  console.log(JSON.stringify({
    amounts, receipts,
    globalBalances: {
      fixture: 'A participates but owes/paid zero; B paid 100 exclusively for C.',
      expectedForA: { totalYouOwe: 0, totalTheyOwe: 0 }, actual: balances,
    },
    unauthenticatedCron: { status: cronResponse.status, invokedForUsers: cronCalls, body: await cronResponse.json() },
    executionAuthorization: { authenticatedUser: 'user-A', requestedExecution: 'owned-by-B', status: executionResponse.status, helperArguments: executionCalls },
    repeatedGroupVoice: { updateId: 42, deliveries: 2, personalHandlerCalls: voiceCalls },
    cleanDatabaseMigrations: migrationEvidence,
  }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
