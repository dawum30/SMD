# Akwaaba SchoolSuite — System Architecture

## 1. Overview
Akwaaba SchoolSuite is a multi-tenant Ghanaian Basic School Management System supporting **Basic 1 through Basic 9** (initially active on Basic 3 with full Basic 1–9 scalability) and isolated multi-school tenancy.

## 2. Technology Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Recharts (interactive charts), jsPDF + jspdf-autotable (client-side multi-page PDF report cards & institutional exports).
- **Database & Backend Platform (Production)**: Supabase (PostgreSQL 15+, Supabase Auth, Supabase Storage, Row Level Security, PL/pgSQL Triggers, Views, and RPC functions).
- **Local / Sandbox Persistence Mode**: Express (`server.ts`) + `better-sqlite3` relational engine with scrypt password hashing, HMAC-signed Bearer session tokens, and local image uploads (`uploads/`), automatically active when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are not configured.
- **Deployment**: Vercel (`vercel.json` configured for Vite SPA + security headers).

## 3. Folder Organization
- `/supabase/migrations/` — 6 ordered SQL migrations covering all 21 normalized tables, constraints, indexes, triggers, views, RPCs, RLS policies, and Storage buckets.
- `/server/` & `/server.ts` — Express server + SQLite schema, seed, and RBAC API routes.
- `/src/types/` — Shared TypeScript interfaces matching the PostgreSQL schema.
- `/src/services/api.ts` — Dual-target data & auth adapter speaking cleanly to `@supabase/supabase-js` or `/api/*`.
- `/src/context/` — `AuthContext` (session, active school, roles) and `ToastContext`.
- `/src/components/` — `Layout`, `Modal`, `ConfirmModal`, `Avatar`.
- `/src/pages/` — Modular feature pages (`DashboardPage`, `StudentsPage`, `TeachersPage`, `SubjectsPage`, `ClassesPage`, `ResultsPage`, `AttendancePage`, `ReportsPage`, `SettingsPage`, `LoginPage`).
- `/src/utils/` — `grading.ts` (grading lookup, ordinals, CSV export) and `pdfGenerator.ts` (Report Cards & General Reports PDF builder).
