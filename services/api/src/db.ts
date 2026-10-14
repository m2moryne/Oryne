import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * The API's own records. The chain is the source of truth for money and
 * mandates; this database indexes it and holds what the chain doesn't:
 * names, sessions, approval requests and the service directory.
 */

const schema = `
create table if not exists kv (key text primary key, value text not null);

create table if not exists challenges (
  nonce text primary key, address text not null, message text not null, expires_at integer not null
);
create table if not exists sessions (
  token text primary key, address text not null, expires_at integer not null
);

create table if not exists wallets (
  id text primary key,            -- contract ID (C…)
  owner text not null,            -- owner address (G… for Freighter, C… for passkey wallets)
  name text not null default 'My wallet',
  tx_hash text, created_at integer not null
);
create index if not exists wallets_owner on wallets(owner);

create table if not exists agents (
  public_key text primary key,    -- the agent's session key (G…)
  wallet_id text not null references wallets(id),
  name text not null, kind text not null default 'Other',
  per_tx text not null, budget text not null, window_secs integer not null,
  expires_at integer not null default 0, payees text not null default '[]',
  status text not null default 'active',   -- active | paused | removed
  created_at integer not null
);
create index if not exists agents_wallet on agents(wallet_id);

create table if not exists payments (
  id text primary key, wallet_id text not null, agent text, payee text not null,
  amount text not null, asset text not null, resource text,
  status text not null,           -- settled | refused | failed
  reason text, tx_hash text, ledger integer, approved_by_owner integer not null default 0,
  created_at integer not null
);
create index if not exists payments_wallet on payments(wallet_id, created_at desc);

create table if not exists approvals (
  id text primary key, wallet_id text not null, agent text not null,
  payee text not null, amount text not null, description text not null default '',
  resource text, reason text,
  status text not null default 'pending',  -- pending | approved | declined | expired
  tx_hash text, created_at integer not null, resolved_at integer
);
create index if not exists approvals_wallet on approvals(wallet_id, status);

create table if not exists intents (
  id text primary key, owner text not null, kind text not null,
  data text not null, xdr text not null,
  status text not null default 'pending',  -- pending | submitted | failed
  tx_hash text, error text, created_at integer not null
);

-- People who sign in with Google or GitHub. Freighter users are identified by their G… address alone.
create table if not exists users (
  subject text primary key,       -- "google:<id>" or "github:<id>"
  provider text not null, email text, name text, avatar text, created_at integer not null
);

-- Passkeys that own wallets. The private key never leaves the user's device.
create table if not exists passkeys (
  credential_id text primary key, -- base64url
  subject text not null, wallet_id text, public_key text not null, -- 65-byte uncompressed, hex
  created_at integer not null
);

create table if not exists services (
  id text primary key, name text not null, description text not null default '',
  category text not null default 'Other', url text not null, pay_to text not null,
  price text not null, unit text not null default 'call', owner text,
  created_at integer not null
);
`

export type Db = DatabaseSync

/** Columns added after the first release; added to existing databases on start. */
const additions = [
  // account | passkey
  "alter table wallets add column owner_kind text not null default 'account'",
  // envelope (owner signs the transaction) | passkey (owner signs an auth entry)
  "alter table intents add column mode text not null default 'envelope'",
  'alter table intents add column auth_entry text',
  'alter table intents add column valid_until integer',
]

export function openDb(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true })
  const db = new DatabaseSync(join(dataDir, 'oryne.db'))
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on;')
  db.exec(schema)
  for (const statement of additions) {
    try {
      db.exec(statement)
    } catch {
      // Column already there.
    }
  }
  return db
}

export const now = () => Math.floor(Date.now() / 1000)

export function getKv(db: Db, key: string): string | undefined {
  const row = db.prepare('select value from kv where key = ?').get(key) as { value: string } | undefined
  return row?.value
}

export function setKv(db: Db, key: string, value: string) {
  db.prepare('insert into kv (key, value) values (?, ?) on conflict(key) do update set value = excluded.value').run(key, value)
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
