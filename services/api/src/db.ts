import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import pg from 'pg'

/**
 * The API's own records. The chain is the source of truth for money and
 * mandates; this database indexes it and holds what the chain doesn't:
 * names, sessions, approval requests and the service directory.
 *
 * Two drivers behind one interface: Postgres (e.g. Supabase) when
 * DATABASE_URL is set, so records survive restarts on hosts with no disk;
 * otherwise a SQLite file in the data directory, for local development.
 * Queries use `?` placeholders and SQL both understand.
 */

/** Integer columns hold Unix seconds and counts. Postgres gets bigint so timestamps don't stop in 2038. */
const schema = (int: 'integer' | 'bigint') => `
create table if not exists kv (key text primary key, value text not null);

create table if not exists challenges (
  nonce text primary key, address text not null, message text not null, expires_at ${int} not null
);
create table if not exists sessions (
  token text primary key, address text not null, expires_at ${int} not null
);

create table if not exists wallets (
  id text primary key,            -- contract ID (C…)
  owner text not null,            -- owner address (G… for Freighter, C… for passkey wallets)
  name text not null default 'My wallet',
  tx_hash text, created_at ${int} not null,
  owner_kind text not null default 'account'  -- account | passkey
);
create index if not exists wallets_owner on wallets(owner);

create table if not exists agents (
  public_key text primary key,    -- the agent's session key (G…)
  wallet_id text not null references wallets(id),
  name text not null, kind text not null default 'Other',
  per_tx text not null, budget text not null, window_secs ${int} not null,
  expires_at ${int} not null default 0, payees text not null default '[]',
  status text not null default 'active',   -- active | paused | removed
  created_at ${int} not null
);
create index if not exists agents_wallet on agents(wallet_id);

create table if not exists payments (
  id text primary key, wallet_id text not null, agent text, payee text not null,
  amount text not null, asset text not null, resource text,
  status text not null,           -- settled | refused | failed
  reason text, tx_hash text, ledger ${int}, approved_by_owner ${int} not null default 0,
  created_at ${int} not null
);
create index if not exists payments_wallet on payments(wallet_id, created_at desc);

create table if not exists approvals (
  id text primary key, wallet_id text not null, agent text not null,
  payee text not null, amount text not null, description text not null default '',
  resource text, reason text,
  status text not null default 'pending',  -- pending | approved | declined | expired
  tx_hash text, created_at ${int} not null, resolved_at ${int}
);
create index if not exists approvals_wallet on approvals(wallet_id, status);

create table if not exists intents (
  id text primary key, owner text not null, kind text not null,
  data text not null, xdr text not null,
  status text not null default 'pending',  -- pending | submitted | failed
  tx_hash text, error text, created_at ${int} not null,
  mode text not null default 'envelope',   -- envelope (owner signs the transaction) | passkey (owner signs an auth entry)
  auth_entry text, valid_until ${int}
);

-- People who sign in with Google or GitHub. Freighter users are identified by their G… address alone.
create table if not exists users (
  subject text primary key,       -- "google:<id>" or "github:<id>"
  provider text not null, email text, name text, avatar text, created_at ${int} not null
);

-- Passkeys that own wallets. The private key never leaves the user's device.
create table if not exists passkeys (
  credential_id text primary key, -- base64url
  subject text not null, wallet_id text, public_key text not null, -- 65-byte uncompressed, hex
  created_at ${int} not null
);

-- Secret keys for an owner's servers (see api-keys.ts). Only a hash of each key is stored.
create table if not exists api_keys (
  id text primary key, owner text not null, name text not null,
  mode text not null,             -- test | live
  last4 text not null, key_hash text not null unique,
  scopes text not null,           -- JSON list
  created_at ${int} not null, last_used_at ${int}, revoked_at ${int}
);
create index if not exists api_keys_owner on api_keys(owner);

-- One row per authenticated API call (see requests.ts). No bodies: they can carry secrets.
create table if not exists requests (
  id text primary key, owner text not null, wallet_id text,
  actor_kind text not null,       -- owner | agent | key
  actor text,                     -- the agent's public key, or the API key's id
  method text not null, path text not null, status ${int} not null, latency_ms ${int} not null,
  error text, user_agent text, created_at ${int} not null
);
create index if not exists requests_owner on requests(owner, created_at desc);

create table if not exists services (
  id text primary key, name text not null, description text not null default '',
  category text not null default 'Other', url text not null, pay_to text not null,
  price text not null, unit text not null default 'call', owner text,
  created_at ${int} not null
);
`

/**
 * SQLite files from before these columns were in the schema. Postgres
 * databases start with the full schema; later additions go here with
 * `add column if not exists` for Postgres.
 */
const sqliteAdditions = [
  "alter table wallets add column owner_kind text not null default 'account'",
  "alter table intents add column mode text not null default 'envelope'",
  'alter table intents add column auth_entry text',
  'alter table intents add column valid_until integer',
]

type Param = string | number | bigint | null | undefined | Uint8Array

export type Statement = {
  get<T = Record<string, any>>(...params: Param[]): Promise<T | undefined>
  all<T = Record<string, any>>(...params: Param[]): Promise<T[]>
  run(...params: Param[]): Promise<void>
}

export type Db = {
  prepare(sql: string): Statement
  close(): Promise<void>
}

const clean = (params: Param[]) => params.map((param) => (param === undefined ? null : param))

function openSqlite(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true })
  const db = new DatabaseSync(join(dataDir, 'oryne.db'))
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on;')
  db.exec(schema('integer'))
  for (const statement of sqliteAdditions) {
    try {
      db.exec(statement)
    } catch {
      // Column already there.
    }
  }
  return {
    prepare(sql) {
      const statement = db.prepare(sql)
      return {
        get: async (...params) => statement.get(...(clean(params) as never[])) as never,
        all: async (...params) => statement.all(...(clean(params) as never[])) as never,
        run: async (...params) => {
          statement.run(...(clean(params) as never[]))
        },
      }
    },
    close: async () => db.close(),
  }
}

/** `?` → `$1, $2, …`, skipping anything inside single quotes. */
function numbered(sql: string) {
  let index = 0
  let quoted = false
  let out = ''
  for (const char of sql) {
    if (char === "'") quoted = !quoted
    out += char === '?' && !quoted ? `$${++index}` : char
  }
  return out
}

// bigint columns come back as JavaScript numbers, like SQLite's integers.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value))

async function openPostgres(url: string): Promise<Db> {
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    // Hosted Postgres (Supabase and others) needs TLS; local servers usually don't offer it.
    ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? undefined : { rejectUnauthorized: false },
  })
  pool.on('error', (error) => console.error('Postgres connection error:', error.message))
  await pool.query(schema('bigint'))

  const query = async (sql: string, params: Param[]) =>
    (await pool.query(numbered(sql), clean(params))).rows
  return {
    prepare(sql) {
      return {
        get: async (...params) => (await query(sql, params))[0] as never,
        all: async (...params) => (await query(sql, params)) as never,
        run: async (...params) => {
          await query(sql, params)
        },
      }
    },
    close: () => pool.end(),
  }
}

export async function openDb(options: { dataDir: string; databaseUrl?: string }): Promise<Db> {
  return options.databaseUrl ? openPostgres(options.databaseUrl) : openSqlite(options.dataDir)
}

export const now = () => Math.floor(Date.now() / 1000)

export async function getKv(db: Db, key: string): Promise<string | undefined> {
  return (await db.prepare('select value from kv where key = ?').get<{ value: string }>(key))?.value
}

export async function setKv(db: Db, key: string, value: string) {
  await db
    .prepare('insert into kv (key, value) values (?, ?) on conflict(key) do update set value = excluded.value')
    .run(key, value)
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
