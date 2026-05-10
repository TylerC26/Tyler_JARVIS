# Supabase migrations

Apply in order against your Supabase project (SQL Editor or `supabase db push`).

1. `0001_profiles.sql` — profile metadata, references `auth.users`
2. `0002_habits.sql` — habits + daily logs
3. `0003_finance.sql` — accounts, categories, transactions, fixed expenses
4. `0004_tasks.sql` — tasks with status/priority/due

## RLS

Every migration writes proper `owner_id = auth.uid()` policies but ends with
`ALTER TABLE ... DISABLE ROW LEVEL SECURITY;`. This is intentional for the
single-user MVP — the app reads/writes with the anon key under a hardcoded
`OWNER_ID`. When real multi-user lands, run a single migration that flips RLS
back on for every table.

## Generating types

After applying, regenerate `lib/db/types.ts` with:

```bash
npx supabase gen types typescript --project-id <id> --schema public > lib/db/types.generated.ts
```

Then either replace the hand-written file or import the generated `Database`
type. The hand-written file in v1 is enough to compile cleanly without a
Supabase project.

## Until you wire it up

The app is designed to render with empty states when `NEXT_PUBLIC_SUPABASE_URL`
is unset. Every query returns `[]` and every mutation no-ops with a friendly
error. Set the env vars in `.env.local`, run the migrations, and the data flows.
