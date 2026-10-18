-- Home System schema for Supabase (Postgres).
--
-- Apply once per project:
--   Supabase dashboard -> SQL Editor -> paste -> Run
--   or: psql "$DATABASE_URL" -f supabase/schema.sql
--   or: mise run migrate   (same file, through the app's own connection)
--
-- The document shapes this replaces: a category document with embedded items
-- becomes categories + items; a bill document with embedded items becomes
-- bills + bill_items.

create table if not exists categories (
  id        text primary key,
  name      text not null default '',
  position  integer not null default 0
);

create table if not exists items (
  id          text primary key,
  category_id text not null references categories (id) on delete cascade,
  name        text not null default '',
  room        text not null default '',
  qty         numeric not null default 0 check (qty >= 0),
  unit        text not null default 'pc',
  min         numeric not null default 0 check (min >= 0),
  tags        text[] not null default '{}',
  aliases     text[] not null default '{}',
  patterns    text[] not null default '{}',
  position    integer not null default 0
);

alter table items add column if not exists aliases text[] not null default '{}';
alter table items add column if not exists patterns text[] not null default '{}';

create index if not exists items_category_idx on items (category_id, position);

create table if not exists bills (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  store      text not null,
  note       text not null default '',
  total      numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists bills_date_idx on bills (date desc);

create table if not exists bill_items (
  id         bigint generated always as identity primary key,
  bill_id    uuid not null references bills (id) on delete cascade,
  name       text not null,
  key        text not null,
  -- Deliberately NOT a foreign key to items: deleting an item must not delete
  -- what you paid for it. The purchase history is the only record that
  -- survives a deleted item or category, and that is what a lost category was
  -- once rebuilt from.
  item_id    text,
  category   text,
  qty        numeric not null check (qty > 0),
  unit       text not null,
  cost       numeric(12, 2) not null check (cost >= 0),
  base       text not null,
  base_qty   numeric not null check (base_qty > 0),
  unit_price numeric not null check (unit_price >= 0)
);

create index if not exists bill_items_bill_idx on bill_items (bill_id);
create index if not exists bill_items_key_idx on bill_items (key);
create index if not exists bill_items_item_idx on bill_items (item_id);

-- Row-level security ON with no policies: PostgREST (the anon/public API
-- Supabase exposes on every project) is denied outright, while this app's
-- server connection -- which authenticates as the database owner, not through
-- PostgREST -- is unaffected. Without this, anyone holding the project's
-- publishable key could read and write the household's data.
alter table categories enable row level security;
alter table items      enable row level security;
alter table bills      enable row level security;
alter table bill_items enable row level security;

create table if not exists subscriptions (
  id          text primary key,
  name        text not null default '',
  type        text not null default '',
  tag         text not null default '',
  holder      text not null default '',
  shareable   boolean not null default false,
  share_count integer check (share_count is null or share_count >= 1),
  position    integer not null default 0
);

alter table subscriptions enable row level security;
