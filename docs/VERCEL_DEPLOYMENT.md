# Vercel Production Deployment Guide

## 1. Prerequisites
- Completed Supabase setup (`docs/SUPABASE_SETUP.md`).
- Repository pushed to GitHub, GitLab, or Bitbucket.

## 2. Configure Vercel Project
1. Import the repository into [Vercel](https://vercel.com).
2. Vercel automatically reads `vercel.json`:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **SPA Rewrite**: Routes non-asset paths cleanly to `/index.html`.
3. Add Environment Variables in **Vercel Project Settings -> Environment Variables**:
   - `VITE_SUPABASE_URL`: Your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase Public Anon Key
4. Trigger a production deployment (`Deploy`).

## 3. Post-Deployment Verification
1. Open the deployed Vercel URL and sign in with your Supabase Auth credentials.
2. Verify that `Settings -> School Profile`, `Students`, `Results`, and `Reports` read and persist directly to Supabase PostgreSQL and Storage.
