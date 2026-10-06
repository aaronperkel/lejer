import postgres from "postgres";

// The only module that talks to Postgres. App code gets a transaction through
// withHousehold (tenant data) or withUser (users/login_codes, the switcher); the raw client
// is not exported. adminSql() is the owner connection and has exactly four call sites —
// see CLAUDE.md before adding a fifth.

const options = {
  ssl: "require",
  prepare: false, // Neon's pooler is PgBouncer in transaction mode: no prepared statements
  idle_timeout: 20,
  onnotice: () => {},
  types: {
    // DATE stays 'YYYY-MM-DD', NUMERIC and COUNT(*) (int8) parse to numbers.
    // TIMESTAMPTZ keeps the default Date parsing.
    date: { to: 1082, from: [1082], serialize: (s: string) => s, parse: (s: string) => s },
    numeric: { to: 1700, from: [1700], serialize: String, parse: Number },
    int8: { to: 20, from: [20], serialize: String, parse: Number },
  },
} satisfies postgres.Options<Record<string, postgres.PostgresType>>;

function connect(envVar: "DATABASE_URL" | "DATABASE_URL_ADMIN", max: number) {
  const url = process.env[envVar];
  if (!url) throw new Error(`${envVar} is not set`);
  return postgres(url, { ...options, max });
}

type Client = ReturnType<typeof connect>;
export type Tx = postgres.TransactionSql<Client extends postgres.Sql<infer T> ? T : never>;

// Created on first use so importing this module never needs credentials (next build,
// scripts that only use the owner connection).
let appClient: Client | undefined;
let ownerClient: Client | undefined;
const app = () => (appClient ??= connect("DATABASE_URL", 3)); // Fluid Compute reuses the instance
export const adminSql = () => (ownerClient ??= connect("DATABASE_URL_ADMIN", 1));

/** Who the transaction is for. Ctx satisfies this; the cron passes a system ctx with no user. */
export interface TenantScope {
  household: { id: number };
  user: { id: number } | null;
  demo?: boolean;
}

/**
 * Runs fn in a transaction scoped to one household. Row-level security reads these
 * transaction-local settings; outside this (or withUser) lejer_app sees no tenant rows.
 */
export async function withHousehold<T>(scope: TenantScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  // The demo household lives in lib/demo.ts; callers branch on ctx.demo before getting here.
  if (scope.demo) throw new Error("withHousehold called with the demo context");
  return app().begin(async (tx) => {
    await tx`SELECT set_config('app.household_id', ${String(scope.household.id)}, true),
                    set_config('app.user_id', ${scope.user ? String(scope.user.id) : ""}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

/**
 * Runs fn in a transaction with only app.user_id set: users/login_codes (no RLS) and the
 * switcher (my memberships and their households' names). userId is null before login.
 */
export async function withUser<T>(userId: number | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return app().begin(async (tx) => {
    await tx`SELECT set_config('app.user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx);
  }) as Promise<T>;
}
