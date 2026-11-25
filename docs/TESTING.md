# Testing & Verification Checklist

## 1. Build & Static Type Check
- `npm run lint` (`tsc --noEmit`) passes with 0 errors.
- `npm run build` (`vite build`) produces clean production bundle.

## 2. Authentication & RBAC Verification
- **Unauthenticated access**: Direct requests to protected `/api/*` endpoints return `401 Unauthorized`.
- **Teacher scoping**: Signing in as `kofi.owusu@accraridgebasic.edu.gh` restricts Students, Classes, Results, and Attendance to assigned classes/subjects only, and blocks access to `Settings` admin actions (`403 Forbidden`).
- **Locked results guard**: Locking Term 1 or Term 2 results as School Admin prevents teachers from editing or deleting locked entries.
- **Multi-school isolation**: Creating a second school as Super Admin (`superadmin@akwaabasms.gh`) keeps students, teachers, subjects, and results strictly isolated per `school_id`.

## 3. Functional Module Verification
- **Dashboard**: Filters by Academic Year, Term, and Class dynamically update the 6 KPI cards, 4 charts, and performance highlights.
- **Students**: Registration auto-generates `ARBS-YYYY-XXXX`, photo upload works, search/filter/pagination work, profile modal shows promotion & academic history, CSV & print work.
- **Teachers**: GES fields (`gha_number`, `current_rank`, `first_appointment_date`, `date_promoted`) persist and display in assignments view.
- **Subjects & Classes**: Duplicate subject assignment in the same class is rejected (`409 Conflict`).
- **Results**: Max mark validation rejects out-of-range scores; totals, grades, remarks, and positions compute accurately.
- **Attendance**: Daily roll call saves & computes term attendance percentages.
- **Reports**: Individual and bulk multi-page PDF report cards generate and download cleanly.
