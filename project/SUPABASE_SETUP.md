# Kathi x Josh 30 — make the site shared (Supabase)

## 1. Create the database (5 min)
1. Go to https://supabase.com → sign up (free) → **New project** (any name, e.g. kathi30; pick a region near the US West).
2. Open **SQL Editor** → New query → paste everything below → **Run**.

```sql
create table if not exists drivers  (id text primary key, name text, origin text, seats int, leaving text, created_at timestamptz default now());
create table if not exists riders   (id text primary key, name text, origin text, details text, driver_id text, created_at timestamptz default now());
create table if not exists notes    (id text primary key, name text, msg text, photo text, created_at timestamptz default now());
create table if not exists payments (id text primary key, name text, method text, at bigint, created_at timestamptz default now());

alter table drivers  enable row level security;
alter table riders   enable row level security;
alter table notes    enable row level security;
alter table payments enable row level security;

create policy "guests read"   on drivers  for select using (true);
create policy "guests add"    on drivers  for insert with check (true);
create policy "guests edit"   on drivers  for update using (true);
create policy "guests remove" on drivers  for delete using (true);
create policy "guests read"   on riders   for select using (true);
create policy "guests add"    on riders   for insert with check (true);
create policy "guests edit"   on riders   for update using (true);
create policy "guests remove" on riders   for delete using (true);
create policy "guests read"   on notes    for select using (true);
create policy "guests add"    on notes    for insert with check (true);
create policy "guests remove" on notes    for delete using (true);
create policy "guests read"   on payments for select using (true);
create policy "guests add"    on payments for insert with check (true);
```

## 2. Connect the site
1. In Supabase: **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
2. Open *Kathi 30 Website v5* → Tweaks panel → **Backend** → paste them into *supabaseUrl* and *supabaseKey*.
   (Do the same in *Kathi 30 Host Sheet* so it reads live carpool + payment data.)
3. Done — carpool board, guest book and "I paid" now sync for everyone (refreshes every ~12 s).

## 3. Publish
Ask me to "bundle v5 for publishing" → I create one self-contained HTML file → drag it onto https://app.netlify.com/drop → share the link.

## Notes
- The anon key is meant to be public; the policies above let guests add/remove entries (fine for a friends' party).
- Keep the Host Sheet private — don't publish it.
- RSVPs still live in Partiful (export CSV → import into the Host Sheet).
