# Database Schema & Relationship Documentation

Every school-owned table contains `school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE` and is protected by Row Level Security (RLS).

## 1. Core Tables
1. `schools`: Multi-tenant school registry (`id`, `name`, `code`, `motto`, `address`, `region`, `district`, `phone`, `email`, `logo_url`).
2. `profiles`: Mirrors `auth.users` (`id`, `email`, `full_name`, `is_super_admin`, `is_active`).
3. `school_memberships`: Associates users with schools and roles (`super_admin`, `school_admin`, `teacher`), unique on `(school_id, user_id)`.
4. `academic_years`: School academic calendars (`name` e.g. `2025/2026`, `is_current`).
5. `terms`: `Term 1`, `Term 2`, `Term 3` linked to `academic_years`, including `next_reopening_date`.
6. `teachers`: Staff directory including Ghanaian GES fields (`teacher_code`, `gha_number`, `academic_qualification`, `first_appointment_date`, `current_rank`, `date_promoted`, `employment_status`).
7. `classes`: Basic 1–9 (`level_number` 1..9) + streams (`class_teacher_id` -> `teachers`).
8. `guardians`: Parent/guardian contact records.
9. `students`: Student registry (`student_code`, `current_class_id`, `guardian_id`, `status`).
10. `subjects`: Subject catalog (`subject_code`, `name`, `is_core`, `status`).

## 2. Academic Relationship Tables
11. `class_subjects`: Maps subjects offered by a class and the assigned subject teacher. Unique `(school_id, class_id, subject_id)` prevents duplicate assignments per class.
12. `teacher_subjects`: Normalized many-to-many qualification/teaching assignment between `teachers` and `subjects`.
13. `student_enrollments`: Preserves full historical class placement across promotions (`UNIQUE (school_id, student_id, academic_year_id)`).

## 3. Assessment & Performance Tables
14. `assessments`: Configurable component maximums summing to 100 (`class_exercise_max=10`, `homework_max=10`, `project_max=10`, `exam_max=70`).
15. `grading_scales`: Configurable grade boundaries (`A` 80–100 through `F` 0–39).
16. `results`: Termly scores per student and subject (`UNIQUE (school_id, student_id, subject_id, academic_year_id, term_id)`), with `is_locked` guard.
17. `attendance`: Daily student attendance (`UNIQUE (school_id, student_id, attendance_date)`).
18. `report_comments`: Termly conduct, attitude, interest, class teacher & headteacher remarks.

## 4. Configuration & Audit Tables
19. `school_settings`: ID prefixes, default comments, headteacher name, report display toggles.
20. `notifications`: School/user alerts.
21. `audit_logs`: Immutable audit trail of administrative actions.
