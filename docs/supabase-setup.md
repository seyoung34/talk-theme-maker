# Supabase Setup

## Environment

Copy `.env.example` to `.env.local` and set:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

Use the publishable key for browser/client operations and the secret key only on the server.

## Database

Apply the migration in `supabase/migrations/202606180001_supabase_theme_storage.sql`.

The migration creates:

- `admin_profiles`
- `system_template_bundles`
- `system_template_variants`
- `admin_assets`
- private Storage bucket `theme-assets`
- RLS policies for public template reads and admin writes
- explicit Data API grants for `anon` and `authenticated` roles

If `Automatically expose new tables` is disabled in Supabase project settings, the explicit `grant` statements in the migration are required. Without them, RLS policies can be correct but Data API requests still fail before policy checks.

## First Admin

After creating a Supabase Auth user, seed the first admin with SQL in the Supabase SQL editor:

```sql
insert into public.admin_profiles (user_id, email, role)
values ('AUTH_USER_ID', 'admin@example.com', 'admin');
```

Replace `AUTH_USER_ID` with the user id from Supabase Auth.

## Local Data Migration

The one-time browser IndexedDB migration UI has been removed after the initial migration. Use direct SQL or a temporary script if another local migration is needed later.
