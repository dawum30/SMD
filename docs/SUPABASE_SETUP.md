# Supabase Setup Instructions

## 1. Create Supabase Project
1. Sign in to [https://supabase.com](https://supabase.com) and create a new PostgreSQL project.
2. Note your **Project URL** (`VITE_SUPABASE_URL`) and **Public Anon Key** (`VITE_SUPABASE_ANON_KEY`) from **Project Settings -> API**.
3. Never place `SUPABASE_SERVICE_ROLE_KEY` in any `VITE_*` variable or client-side code.

## 2. Run SQL Migrations
In the Supabase Dashboard **SQL Editor**, execute the migration files in exact numerical order:
1. `supabase/migrations/001_core_tables.sql`
2. `supabase/migrations/002_academic_and_assessment_tables.sql`
3. `supabase/migrations/003_configuration_and_audit_tables.sql`
4. `supabase/migrations/004_functions_triggers_views.sql`
5. `supabase/migrations/005_rls_policies.sql`
6. `supabase/migrations/006_storage_and_seed.sql`

*(Alternatively, run `supabase db push` with the Supabase CLI.)*

## 3. Create Initial Super Administrator
1. In **Authentication -> Users**, create your Super Administrator email/password account.
2. Run in SQL Editor:
   ```sql
   UPDATE public.profiles SET is_super_admin = TRUE WHERE email = 'your-admin@school.edu.gh';
   ```
3. Sign in to Akwaaba SchoolSuite using that account, open **Settings -> Multi-School**, and create your first school.
