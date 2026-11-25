import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { db, hashPassword, newUuid, UPLOADS_DIR, verifyPassword } from './db';

const SESSION_SECRET = process.env.SESSION_SECRET || 'akwaaba-local-dev-secret-change-in-production';

interface TokenPayload {
  userId: string;
  exp: number;
}

function signToken(userId: string): string {
  const payload: TokenPayload = {
    userId,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as TokenPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

interface AuthedRequest extends Request {
  user?: {
    id: string;
    email: string;
    full_name: string;
    phone: string;
    avatar_url: string;
    is_super_admin: boolean;
    is_active: boolean;
  };
  schoolId?: string;
  role?: 'super_admin' | 'school_admin' | 'teacher';
  teacherRecordId?: string | null;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return;
  }
  const user = db.prepare('SELECT id, email, full_name, phone, avatar_url, is_super_admin, is_active FROM profiles WHERE id = ?').get(payload.userId) as
    | { id: string; email: string; full_name: string; phone: string; avatar_url: string; is_super_admin: number; is_active: number }
    | undefined;

  if (!user || !user.is_active) {
    res.status(401).json({ error: 'Account inactive or not found.' });
    return;
  }

  req.user = {
    ...user,
    is_super_admin: Boolean(user.is_super_admin),
    is_active: Boolean(user.is_active),
  };

  const requestedSchoolId = (req.headers['x-school-id'] as string) || '';
  const memberships = db
    .prepare('SELECT school_id, role FROM school_memberships WHERE user_id = ? AND is_active = 1')
    .all(user.id) as { school_id: string; role: 'super_admin' | 'school_admin' | 'teacher' }[];

  if (user.is_super_admin) {
    if (requestedSchoolId) {
      const schoolExists = db.prepare('SELECT id FROM schools WHERE id = ?').get(requestedSchoolId);
      if (!schoolExists) {
        res.status(404).json({ error: 'Selected school not found.' });
        return;
      }
      req.schoolId = requestedSchoolId;
    } else if (memberships.length > 0) {
      req.schoolId = memberships[0].school_id;
    } else {
      const firstSchool = db.prepare('SELECT id FROM schools LIMIT 1').get() as { id: string } | undefined;
      req.schoolId = firstSchool?.id;
    }
    req.role = 'super_admin';
  } else {
    if (memberships.length === 0) {
      res.status(403).json({ error: 'No active school membership assigned.' });
      return;
    }
    const matched = requestedSchoolId ? memberships.find((m) => m.school_id === requestedSchoolId) : memberships[0];
    if (!matched) {
      res.status(403).json({ error: 'Unauthorized cross-school access blocked.' });
      return;
    }
    req.schoolId = matched.school_id;
    req.role = matched.role;
  }

  if (req.schoolId) {
    const teacherRec = db
      .prepare('SELECT id FROM teachers WHERE school_id = ? AND user_id = ?')
      .get(req.schoolId, user.id) as { id: string } | undefined;
    req.teacherRecordId = teacherRec?.id || null;
  }

  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.role !== 'super_admin' && req.role !== 'school_admin') {
    res.status(403).json({ error: 'Administrator privileges required for this operation.' });
    return;
  }
  next();
}

function requireSuperAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user?.is_super_admin) {
    res.status(403).json({ error: 'Super Administrator privileges required.' });
    return;
  }
  next();
}

function getTeacherAccessibleClassIds(schoolId: string, teacherId: string | null | undefined): string[] {
  if (!teacherId) return [];
  const rows = db
    .prepare(
      `SELECT DISTINCT id FROM classes WHERE school_id = ? AND class_teacher_id = ?
       UNION
       SELECT DISTINCT class_id AS id FROM class_subjects WHERE school_id = ? AND teacher_id = ?`
    )
    .all(schoolId, teacherId, schoolId, teacherId) as { id: string }[];
  return rows.map((r) => r.id);
}

function teacherCanAccessSubject(
  schoolId: string,
  teacherId: string | null | undefined,
  classId: string,
  subjectId: string
): boolean {
  if (!teacherId) return false;
  const isClassTeacher = db
    .prepare('SELECT 1 FROM classes WHERE id = ? AND school_id = ? AND class_teacher_id = ?')
    .get(classId, schoolId, teacherId);
  if (isClassTeacher) return true;
  const isSubjectTeacher = db
    .prepare('SELECT 1 FROM class_subjects WHERE school_id = ? AND class_id = ? AND subject_id = ? AND teacher_id = ?')
    .get(schoolId, classId, subjectId, teacherId);
  return Boolean(isSubjectTeacher);
}

function buildSessionPayload(userId: string, preferredSchoolId?: string) {
  const user = db
    .prepare('SELECT id, email, full_name, phone, avatar_url, is_super_admin, is_active, created_at FROM profiles WHERE id = ?')
    .get(userId) as {
    id: string;
    email: string;
    full_name: string;
    phone: string;
    avatar_url: string;
    is_super_admin: number;
    is_active: number;
    created_at: string;
  };

  const memberships = db
    .prepare(
      `SELECT m.*, s.name as school_name
       FROM school_memberships m
       JOIN schools s ON s.id = m.school_id
       WHERE m.user_id = ? AND m.is_active = 1`
    )
    .all(userId) as {
    id: string;
    school_id: string;
    user_id: string;
    role: 'super_admin' | 'school_admin' | 'teacher';
    is_active: number;
  }[];

  const schools = user.is_super_admin
    ? (db.prepare('SELECT * FROM schools ORDER BY name ASC').all() as Record<string, unknown>[])
    : (db
        .prepare(
          `SELECT s.* FROM schools s
           JOIN school_memberships m ON m.school_id = s.id
           WHERE m.user_id = ? AND m.is_active = 1
           ORDER BY s.name ASC`
        )
        .all(userId) as Record<string, unknown>[]);

  let activeSchoolId = preferredSchoolId || memberships[0]?.school_id || (schools[0]?.id as string) || '';
  if (!user.is_super_admin && !memberships.some((m) => m.school_id === activeSchoolId)) {
    activeSchoolId = memberships[0]?.school_id || '';
  }

  const activeRole = user.is_super_admin
    ? 'super_admin'
    : memberships.find((m) => m.school_id === activeSchoolId)?.role || 'teacher';

  const teacherRec = activeSchoolId
    ? (db.prepare('SELECT id FROM teachers WHERE school_id = ? AND user_id = ?').get(activeSchoolId, userId) as
        | { id: string }
        | undefined)
    : undefined;

  return {
    user: {
      ...user,
      is_super_admin: Boolean(user.is_super_admin),
      is_active: Boolean(user.is_active),
    },
    token: signToken(userId),
    activeSchoolId,
    activeRole,
    memberships: memberships.map((m) => ({ ...m, is_active: Boolean(m.is_active) })),
    schools: schools.map((s) => ({ ...s, is_active: Boolean(s.is_active) })),
    teacherRecordId: teacherRec?.id || null,
  };
}

function logAudit(schoolId: string | null, actorId: string | null, action: string, entityType: string, entityId: string | null, details: unknown = {}) {
  db.prepare(`
    INSERT INTO audit_logs (id, school_id, actor_id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(newUuid(), schoolId, actorId, action, entityType, entityId, JSON.stringify(details));
}

export function createApiRouter() {
  const router = express.Router();

  // ==================== AUTHENTICATION ====================
  router.post('/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const profile = db.prepare('SELECT * FROM profiles WHERE lower(email) = lower(?)').get(String(email).trim()) as
      | { id: string; password_hash: string; is_active: number }
      | undefined;

    if (!profile || !profile.is_active || !verifyPassword(String(password), profile.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    res.json(buildSessionPayload(profile.id));
  });

  router.get('/auth/session', requireAuth, (req: AuthedRequest, res) => {
    res.json(buildSessionPayload(req.user!.id, req.schoolId));
  });

  router.post('/auth/reset-password', (req, res) => {
    const { email, newPassword } = req.body || {};
    if (!email) {
      res.status(400).json({ error: 'Email address is required.' });
      return;
    }
    const profile = db.prepare('SELECT id FROM profiles WHERE lower(email) = lower(?)').get(String(email).trim()) as
      | { id: string }
      | undefined;

    if (!profile) {
      // Do not leak user existence in production style, or confirm safely
      res.json({ message: 'If an account matches that email, password reset instructions have been processed.' });
      return;
    }
    if (newPassword && String(newPassword).length >= 6) {
      db.prepare('UPDATE profiles SET password_hash = ?, updated_at = datetime("now") WHERE id = ?').run(
        hashPassword(String(newPassword)),
        profile.id
      );
      res.json({ message: 'Password has been updated successfully. You may now sign in.' });
      return;
    }
    res.json({ message: 'Password reset verified. Enter a new password (minimum 6 characters) to update.' });
  });

  // ==================== FILE UPLOAD (LOCAL STORAGE EQUIVALENT TO SUPABASE STORAGE) ====================
  router.post('/upload', requireAuth, (req: AuthedRequest, res) => {
    const { dataUrl, folder = 'general', filename = 'image.png' } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      res.status(400).json({ error: 'Valid image file is required.' });
      return;
    }
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
    if (!match) {
      res.status(400).json({ error: 'Unsupported image format. Use PNG, JPEG, or WebP.' });
      return;
    }
    const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      res.status(400).json({ error: 'Image size must be under 5 MB.' });
      return;
    }
    const safeFolder = String(folder).replace(/[^a-z0-9_-]/gi, '');
    const targetDir = path.join(UPLOADS_DIR, safeFolder);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const safeName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${path.basename(filename, path.extname(filename)).replace(/[^a-z0-9_-]/gi, '')}.${ext}`;
    fs.writeFileSync(path.join(targetDir, safeName), buffer);
    res.json({ url: `/uploads/${safeFolder}/${safeName}` });
  });

  // ==================== SCHOOLS (SUPER ADMIN MULTI-SCHOOL) ====================
  router.get('/schools', requireAuth, (req: AuthedRequest, res) => {
    if (req.user!.is_super_admin) {
      const rows = db.prepare('SELECT * FROM schools ORDER BY name ASC').all() as Record<string, unknown>[];
      res.json(rows.map((r) => ({ ...r, is_active: Boolean(r.is_active) })));
      return;
    }
    const rows = db
      .prepare(
        `SELECT s.* FROM schools s
         JOIN school_memberships m ON m.school_id = s.id
         WHERE m.user_id = ? AND m.is_active = 1
         ORDER BY s.name ASC`
      )
      .all(req.user!.id) as Record<string, unknown>[];
    res.json(rows.map((r) => ({ ...r, is_active: Boolean(r.is_active) })));
  });

  router.post('/schools', requireAuth, requireSuperAdmin, (req: AuthedRequest, res) => {
    const { name, code, motto = '', address = '', region = 'Greater Accra', district = '', phone = '', email = '', logo_url = '' } = req.body || {};
    if (!name || !code) {
      res.status(400).json({ error: 'School name and unique school code are required.' });
      return;
    }
    const existing = db.prepare('SELECT id FROM schools WHERE lower(code) = lower(?)').get(String(code).trim());
    if (existing) {
      res.status(409).json({ error: 'A school with that code already exists.' });
      return;
    }
    const schoolId = newUuid();
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO schools (id, name, code, motto, address, region, district, phone, email, logo_url, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(schoolId, name.trim(), code.trim().toUpperCase(), motto, address, region, district, phone, email, logo_url || '/crest-default.jpg');

      db.prepare(`
        INSERT INTO school_settings (id, school_id, student_id_prefix, teacher_id_prefix)
        VALUES (?, ?, ?, 'TCH')
      `).run(newUuid(), schoolId, code.trim().toUpperCase().slice(0, 4));

      db.prepare(`
        INSERT INTO assessments (id, school_id, name, class_exercise_max, homework_max, project_max, exam_max, is_active)
        VALUES (?, ?, 'GES Standard SBA + Exam', 10, 10, 10, 70, 1)
      `).run(newUuid(), schoolId);

      const scales = [
        { g: 'A', min: 80, max: 100, r: 'Excellent', o: 1 },
        { g: 'B', min: 70, max: 79.99, r: 'Very Good', o: 2 },
        { g: 'C', min: 60, max: 69.99, r: 'Good', o: 3 },
        { g: 'D', min: 50, max: 59.99, r: 'Credit', o: 4 },
        { g: 'E', min: 40, max: 49.99, r: 'Pass', o: 5 },
        { g: 'F', min: 0, max: 39.99, r: 'Fail', o: 6 },
      ];
      for (const s of scales) {
        db.prepare(`INSERT INTO grading_scales (id, school_id, grade, min_score, max_score, remark, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
          newUuid(), schoolId, s.g, s.min, s.max, s.r, s.o
        );
      }

      const yId = newUuid();
      db.prepare(`INSERT INTO academic_years (id, school_id, name, start_date, end_date, is_current) VALUES (?, ?, '2025/2026', '2025-09-08', '2026-07-24', 1)`).run(yId, schoolId);
      db.prepare(`INSERT INTO terms (id, school_id, academic_year_id, name, term_number, start_date, end_date, is_current) VALUES (?, ?, ?, 'Term 1', 1, '2025-09-08', '2025-12-18', 1)`).run(newUuid(), schoolId, yId);
      db.prepare(`INSERT INTO terms (id, school_id, academic_year_id, name, term_number, start_date, end_date, is_current) VALUES (?, ?, ?, 'Term 2', 2, '2026-01-12', '2026-04-02', 0)`).run(newUuid(), schoolId, yId);
      db.prepare(`INSERT INTO terms (id, school_id, academic_year_id, name, term_number, start_date, end_date, is_current) VALUES (?, ?, ?, 'Term 3', 3, '2026-04-27', '2026-07-24', 0)`).run(newUuid(), schoolId, yId);

      // Seed Basic 1 - Basic 9 classes
      for (let lvl = 1; lvl <= 9; lvl++) {
        db.prepare(`INSERT INTO classes (id, school_id, name, level_number, stream, capacity, is_active) VALUES (?, ?, ?, ?, '', 45, 1)`).run(
          newUuid(), schoolId, `Basic ${lvl}`, lvl
        );
      }
      logAudit(schoolId, req.user!.id, 'CREATE_SCHOOL', 'schools', schoolId, { name, code });
    });
    tx();
    const created = db.prepare('SELECT * FROM schools WHERE id = ?').get(schoolId) as Record<string, unknown>;
    res.status(201).json({ ...created, is_active: Boolean(created.is_active) });
  });

  router.put('/schools/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const { id } = req.params;
    if (!req.user!.is_super_admin && req.schoolId !== id) {
      res.status(403).json({ error: 'Cannot update another school.' });
      return;
    }
    const { name, motto, address, region, district, phone, email, logo_url, is_active } = req.body || {};
    db.prepare(`
      UPDATE schools
      SET name = COALESCE(?, name),
          motto = COALESCE(?, motto),
          address = COALESCE(?, address),
          region = COALESCE(?, region),
          district = COALESCE(?, district),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          logo_url = COALESCE(?, logo_url),
          is_active = COALESCE(?, is_active),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(name, motto, address, region, district, phone, email, logo_url, is_active === undefined ? null : is_active ? 1 : 0, id);
    const updated = db.prepare('SELECT * FROM schools WHERE id = ?').get(id) as Record<string, unknown>;
    res.json({ ...updated, is_active: Boolean(updated.is_active) });
  });

  // ==================== DASHBOARD ANALYTICS ====================
  router.get('/dashboard', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const { academicYearId, termId, classId } = req.query as Record<string, string | undefined>;

    const accessibleClassIds = req.role === 'teacher' ? getTeacherAccessibleClassIds(schoolId, req.teacherRecordId) : null;
    const effectiveClassFilter = classId || '';

    // 1. Summary Counts (filtered by class if selected, or teacher scope)
    let studentWhere = 'WHERE school_id = ?';
    const studentParams: unknown[] = [schoolId];
    if (effectiveClassFilter) {
      studentWhere += ' AND current_class_id = ?';
      studentParams.push(effectiveClassFilter);
    } else if (accessibleClassIds) {
      if (accessibleClassIds.length === 0) {
        studentWhere += ' AND 1=0';
      } else {
        studentWhere += ` AND current_class_id IN (${accessibleClassIds.map(() => '?').join(',')})`;
        studentParams.push(...accessibleClassIds);
      }
    }

    const totalStudents = (db.prepare(`SELECT COUNT(*) as c FROM students ${studentWhere}`).get(...studentParams) as { c: number }).c;
    const maleStudents = (db.prepare(`SELECT COUNT(*) as c FROM students ${studentWhere} AND gender = 'Male'`).get(...studentParams) as { c: number }).c;
    const femaleStudents = (db.prepare(`SELECT COUNT(*) as c FROM students ${studentWhere} AND gender = 'Female'`).get(...studentParams) as { c: number }).c;
    const totalTeachers = (db.prepare(`SELECT COUNT(*) as c FROM teachers WHERE school_id = ? AND employment_status = 'Active'`).get(schoolId) as { c: number }).c;
    const totalSubjects = (db.prepare(`SELECT COUNT(*) as c FROM subjects WHERE school_id = ? AND status = 'Active'`).get(schoolId) as { c: number }).c;
    const totalClasses = (db.prepare(`SELECT COUNT(*) as c FROM classes WHERE school_id = ? AND is_active = 1`).get(schoolId) as { c: number }).c;

    // 2. Results Filter
    let resultWhere = 'WHERE r.school_id = ?';
    const resultParams: unknown[] = [schoolId];
    if (academicYearId) {
      resultWhere += ' AND r.academic_year_id = ?';
      resultParams.push(academicYearId);
    }
    if (termId) {
      resultWhere += ' AND r.term_id = ?';
      resultParams.push(termId);
    }
    if (effectiveClassFilter) {
      resultWhere += ' AND r.class_id = ?';
      resultParams.push(effectiveClassFilter);
    } else if (accessibleClassIds) {
      if (accessibleClassIds.length === 0) {
        resultWhere += ' AND 1=0';
      } else {
        resultWhere += ` AND r.class_id IN (${accessibleClassIds.map(() => '?').join(',')})`;
        resultParams.push(...accessibleClassIds);
      }
    }

    const subjectPerf = db
      .prepare(
        `SELECT sub.name as subject, sub.subject_code as code,
                ROUND(AVG(r.total_score), 1) as average, COUNT(r.id) as entries
         FROM results r
         JOIN subjects sub ON sub.id = r.subject_id
         ${resultWhere}
         GROUP BY r.subject_id, sub.name, sub.subject_code
         ORDER BY average DESC`
      )
      .all(...resultParams) as { subject: string; code: string; average: number; entries: number }[];

    // Term Comparison (across academic year & optional class)
    let termWhere = 'WHERE r.school_id = ?';
    const termParams: unknown[] = [schoolId];
    if (academicYearId) {
      termWhere += ' AND r.academic_year_id = ?';
      termParams.push(academicYearId);
    }
    if (effectiveClassFilter) {
      termWhere += ' AND r.class_id = ?';
      termParams.push(effectiveClassFilter);
    } else if (accessibleClassIds) {
      if (accessibleClassIds.length === 0) {
        termWhere += ' AND 1=0';
      } else {
        termWhere += ` AND r.class_id IN (${accessibleClassIds.map(() => '?').join(',')})`;
        termParams.push(...accessibleClassIds);
      }
    }

    const termComparison = db
      .prepare(
        `SELECT t.name as term, ROUND(AVG(r.total_score), 1) as average, COUNT(r.id) as entries
         FROM terms t
         LEFT JOIN results r ON r.term_id = t.id AND ${termWhere.replace(/^WHERE /, '')}
         WHERE t.school_id = ? ${academicYearId ? 'AND t.academic_year_id = ?' : ''}
         GROUP BY t.term_number, t.name
         ORDER BY t.term_number ASC`
      )
      .all(...termParams, ...(academicYearId ? [schoolId, academicYearId] : [schoolId])) as {
      term: string;
      average: number | null;
      entries: number;
    }[];

    // Grade Distribution
    const scales = db
      .prepare('SELECT grade, remark FROM grading_scales WHERE school_id = ? ORDER BY sort_order ASC')
      .all(schoolId) as { grade: string; remark: string }[];
    const gradeCountsRaw = db
      .prepare(`SELECT r.grade, COUNT(*) as count FROM results r ${resultWhere} GROUP BY r.grade`)
      .all(...resultParams) as { grade: string; count: number }[];
    const gradeMap = new Map(gradeCountsRaw.map((g) => [g.grade, g.count]));
    const gradeDistribution = scales.map((s) => ({
      grade: s.grade,
      remark: s.remark,
      count: gradeMap.get(s.grade) || 0,
    }));

    // Student Rankings for Highest & Lowest Student
    const studentAverages = db
      .prepare(
        `SELECT st.first_name || ' ' || st.surname as name, st.student_code as studentCode,
                COALESCE(c.name, '-') as className, ROUND(AVG(r.total_score), 1) as average
         FROM results r
         JOIN students st ON st.id = r.student_id
         LEFT JOIN classes c ON c.id = r.class_id
         ${resultWhere}
         GROUP BY r.student_id, st.first_name, st.surname, st.student_code, c.name
         ORDER BY average DESC`
      )
      .all(...resultParams) as { name: string; studentCode: string; className: string; average: number }[];

    const overallAvgRow = db
      .prepare(`SELECT ROUND(AVG(r.total_score), 1) as avgScore FROM results r ${resultWhere}`)
      .get(...resultParams) as { avgScore: number | null };

    res.json({
      summary: {
        totalStudents,
        maleStudents,
        femaleStudents,
        totalTeachers,
        totalSubjects,
        totalClasses,
      },
      genderDistribution: [
        { name: 'Male', value: maleStudents, fill: '#064e3b' },
        { name: 'Female', value: femaleStudents, fill: '#d97706' },
      ],
      subjectPerformance: subjectPerf,
      termComparison: termComparison.map((t) => ({
        term: t.term,
        average: t.average ?? 0,
        entries: t.entries,
      })),
      gradeDistribution,
      highlights: {
        highestStudent: studentAverages[0] || null,
        lowestStudent: studentAverages.length > 0 ? studentAverages[studentAverages.length - 1] : null,
        highestSubject: subjectPerf[0]
          ? { name: subjectPerf[0].subject, code: subjectPerf[0].subject, average: subjectPerf[0].average }
          : null,
        lowestSubject:
          subjectPerf.length > 0
            ? {
                name: subjectPerf[subjectPerf.length - 1].subject,
                code: subjectPerf[subjectPerf.length - 1].subject,
                average: subjectPerf[subjectPerf.length - 1].average,
              }
            : null,
        overallAverage: overallAvgRow?.avgScore ?? 0,
      },
    });
  });

  // ==================== ACADEMIC YEARS & TERMS ====================
  router.get('/academic-years', requireAuth, (req: AuthedRequest, res) => {
    const years = db.prepare('SELECT * FROM academic_years WHERE school_id = ? ORDER BY start_date DESC').all(req.schoolId!) as Record<string, unknown>[];
    const terms = db.prepare('SELECT * FROM terms WHERE school_id = ? ORDER BY term_number ASC').all(req.schoolId!) as Record<string, unknown>[];
    res.json({
      academicYears: years.map((y) => ({ ...y, is_current: Boolean(y.is_current) })),
      terms: terms.map((t) => ({ ...t, is_current: Boolean(t.is_current) })),
    });
  });

  router.post('/academic-years', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const { name, start_date, end_date, is_current = false } = req.body || {};
    if (!name || !start_date || !end_date) {
      res.status(400).json({ error: 'Name, start date, and end date are required.' });
      return;
    }
    const id = newUuid();
    const tx = db.transaction(() => {
      if (is_current) {
        db.prepare('UPDATE academic_years SET is_current = 0 WHERE school_id = ?').run(req.schoolId!);
      }
      db.prepare(`INSERT INTO academic_years (id, school_id, name, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?, ?)`).run(
        id, req.schoolId!, name.trim(), start_date, end_date, is_current ? 1 : 0
      );
      for (const n of [1, 2, 3]) {
        db.prepare(`INSERT INTO terms (id, school_id, academic_year_id, name, term_number, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
          newUuid(), req.schoolId!, id, `Term ${n}`, n, start_date, end_date, is_current && n === 1 ? 1 : 0
        );
      }
    });
    tx();
    res.status(201).json({ id, name });
  });

  router.put('/academic-years/:id/activate', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const tx = db.transaction(() => {
      db.prepare('UPDATE academic_years SET is_current = 0 WHERE school_id = ?').run(req.schoolId!);
      db.prepare('UPDATE academic_years SET is_current = 1 WHERE id = ? AND school_id = ?').run(req.params.id, req.schoolId!);
    });
    tx();
    res.json({ success: true });
  });

  router.put('/terms/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const { start_date, end_date, next_reopening_date, is_current } = req.body || {};
    const tx = db.transaction(() => {
      if (is_current) {
        db.prepare('UPDATE terms SET is_current = 0 WHERE school_id = ?').run(req.schoolId!);
      }
      db.prepare(`
        UPDATE terms
        SET start_date = COALESCE(?, start_date),
            end_date = COALESCE(?, end_date),
            next_reopening_date = COALESCE(?, next_reopening_date),
            is_current = COALESCE(?, is_current),
            updated_at = datetime('now')
        WHERE id = ? AND school_id = ?
      `).run(start_date ?? null, end_date ?? null, next_reopening_date ?? null, is_current === undefined ? null : is_current ? 1 : 0, req.params.id, req.schoolId!);
    });
    tx();
    res.json({ success: true });
  });

  // ==================== STUDENTS ====================
  router.get('/students', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const accessible = req.role === 'teacher' ? getTeacherAccessibleClassIds(schoolId, req.teacherRecordId) : null;
    let query = `
      SELECT s.*, c.name as class_name, g.full_name as guardian_name, g.phone as guardian_phone,
             g.address as guardian_address, g.relationship as guardian_relationship
      FROM students s
      LEFT JOIN classes c ON c.id = s.current_class_id
      LEFT JOIN guardians g ON g.id = s.guardian_id
      WHERE s.school_id = ?
    `;
    const params: unknown[] = [schoolId];
    query += ' ORDER BY s.surname ASC, s.first_name ASC';
    res.json(db.prepare(query).all(...params));
  });

  router.get('/students/:id/profile', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const student = db
      .prepare(
        `SELECT s.*, c.name as class_name, g.full_name as guardian_name, g.phone as guardian_phone,
                g.address as guardian_address, g.relationship as guardian_relationship
         FROM students s
         LEFT JOIN classes c ON c.id = s.current_class_id
         LEFT JOIN guardians g ON g.id = s.guardian_id
         WHERE s.id = ? AND s.school_id = ?`
      )
      .get(req.params.id, schoolId) as Record<string, unknown> | undefined;

    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    const enrollments = db
      .prepare(
        `SELECT e.*, c.name as class_name, ay.name as academic_year_name
         FROM student_enrollments e
         JOIN classes c ON c.id = e.class_id
         JOIN academic_years ay ON ay.id = e.academic_year_id
         WHERE e.student_id = ? AND e.school_id = ?
         ORDER BY ay.start_date DESC`
      )
      .all(req.params.id, schoolId);

    const results = db
      .prepare(
        `SELECT r.*, sub.name as subject_name, sub.subject_code, t.name as term_name, ay.name as academic_year_name, c.name as class_name
         FROM results r
         JOIN subjects sub ON sub.id = r.subject_id
         JOIN terms t ON t.id = r.term_id
         JOIN academic_years ay ON ay.id = r.academic_year_id
         JOIN classes c ON c.id = r.class_id
         WHERE r.student_id = ? AND r.school_id = ?
         ORDER BY ay.start_date DESC, t.term_number DESC, sub.name ASC`
      )
      .all(req.params.id, schoolId) as Record<string, unknown>[];

    // Compute current term overall average & class position
    const currentTerm = db.prepare('SELECT id, academic_year_id FROM terms WHERE school_id = ? AND is_current = 1').get(schoolId) as
      | { id: string; academic_year_id: string }
      | undefined;

    let overallAverage = 0;
    let classPosition = 0;
    let classSize = 0;

    if (currentTerm && student.current_class_id) {
      const rankings = db
        .prepare(
          `SELECT student_id, ROUND(AVG(total_score), 2) as avg_score
           FROM results
           WHERE school_id = ? AND class_id = ? AND academic_year_id = ? AND term_id = ?
           GROUP BY student_id
           ORDER BY avg_score DESC`
        )
        .all(schoolId, student.current_class_id, currentTerm.academic_year_id, currentTerm.id) as {
        student_id: string;
        avg_score: number;
      }[];
      classSize = rankings.length;
      const idx = rankings.findIndex((r) => r.student_id === req.params.id);
      if (idx >= 0) {
        overallAverage = rankings[idx].avg_score;
        classPosition = idx + 1;
      }
    }

    res.json({
      student,
      enrollments,
      results: results.map((r) => ({ ...r, is_locked: Boolean(r.is_locked) })),
      overallAverage,
      classPosition,
      classSize,
    });
  });

  router.post('/students', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const {
      first_name,
      middle_name = '',
      surname,
      gender,
      date_of_birth,
      admission_date,
      current_class_id,
      guardian_name,
      guardian_phone,
      guardian_address = '',
      guardian_relationship = 'Parent',
      photo_url = '',
      status = 'Active',
    } = req.body || {};

    if (!first_name || !surname || !gender || !date_of_birth || !current_class_id || !guardian_name || !guardian_phone) {
      res.status(400).json({ error: 'Required student and guardian fields are missing.' });
      return;
    }

    const settings = db.prepare('SELECT student_id_prefix FROM school_settings WHERE school_id = ?').get(schoolId) as
      | { student_id_prefix: string }
      | undefined;
    const prefix = settings?.student_id_prefix || 'STU';
    const admDate = admission_date || new Date().toISOString().slice(0, 10);
    const yr = admDate.slice(0, 4);
    const countRow = db.prepare('SELECT COUNT(*) as c FROM students WHERE school_id = ?').get(schoolId) as { c: number };
    const studentCode = `${prefix}-${yr}-${String(countRow.c + 1).padStart(4, '0')}`;

    const studentId = newUuid();
    const guardianId = newUuid();

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO guardians (id, school_id, full_name, relationship, phone, address)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(guardianId, schoolId, guardian_name.trim(), guardian_relationship, guardian_phone.trim(), guardian_address.trim());

      db.prepare(`
        INSERT INTO students (
          id, school_id, student_code, first_name, middle_name, surname, gender,
          date_of_birth, admission_date, current_class_id, guardian_id, photo_url, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(studentId, schoolId, studentCode, first_name.trim(), middle_name.trim(), surname.trim(), gender, date_of_birth, admDate, current_class_id, guardianId, photo_url, status);

      const currentYear = db.prepare('SELECT id FROM academic_years WHERE school_id = ? AND is_current = 1').get(schoolId) as
        | { id: string }
        | undefined;
      if (currentYear) {
        db.prepare(`
          INSERT INTO student_enrollments (id, school_id, student_id, class_id, academic_year_id, enrolled_at, promotion_status)
          VALUES (?, ?, ?, ?, ?, ?, 'Active')
        `).run(newUuid(), schoolId, studentId, current_class_id, currentYear.id, admDate);
      }
      logAudit(schoolId, req.user!.id, 'CREATE_STUDENT', 'students', studentId, { studentCode });
    });
    tx();

    const created = db
      .prepare(
        `SELECT s.*, c.name as class_name, g.full_name as guardian_name, g.phone as guardian_phone, g.address as guardian_address
         FROM students s LEFT JOIN classes c ON c.id = s.current_class_id LEFT JOIN guardians g ON g.id = s.guardian_id
         WHERE s.id = ?`
      )
      .get(studentId);
    res.status(201).json(created);
  });

  router.put('/students/:id', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const existing = db.prepare('SELECT * FROM students WHERE id = ? AND school_id = ?').get(req.params.id, schoolId) as
      | { id: string; guardian_id: string | null; current_class_id: string | null }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    const {
      first_name,
      middle_name,
      surname,
      gender,
      date_of_birth,
      admission_date,
      current_class_id,
      guardian_name,
      guardian_phone,
      guardian_address,
      guardian_relationship,
      photo_url,
      status,
    } = req.body || {};

    const tx = db.transaction(() => {
      if (existing.guardian_id && (guardian_name || guardian_phone || guardian_address !== undefined)) {
        db.prepare(`
          UPDATE guardians
          SET full_name = COALESCE(?, full_name),
              phone = COALESCE(?, phone),
              address = COALESCE(?, address),
              relationship = COALESCE(?, relationship),
              updated_at = datetime('now')
          WHERE id = ? AND school_id = ?
        `).run(guardian_name ?? null, guardian_phone ?? null, guardian_address ?? null, guardian_relationship ?? null, existing.guardian_id, schoolId);
      }
      db.prepare(`
        UPDATE students
        SET first_name = COALESCE(?, first_name),
            middle_name = COALESCE(?, middle_name),
            surname = COALESCE(?, surname),
            gender = COALESCE(?, gender),
            date_of_birth = COALESCE(?, date_of_birth),
            admission_date = COALESCE(?, admission_date),
            current_class_id = COALESCE(?, current_class_id),
            photo_url = COALESCE(?, photo_url),
            status = COALESCE(?, status),
            updated_at = datetime('now')
        WHERE id = ? AND school_id = ?
      `).run(
        first_name ?? null,
        middle_name ?? null,
        surname ?? null,
        gender ?? null,
        date_of_birth ?? null,
        admission_date ?? null,
        current_class_id ?? null,
        photo_url ?? null,
        status ?? null,
        req.params.id,
        schoolId
      );

      if (current_class_id && current_class_id !== existing.current_class_id) {
        const currentYear = db.prepare('SELECT id FROM academic_years WHERE school_id = ? AND is_current = 1').get(schoolId) as
          | { id: string }
          | undefined;
        if (currentYear) {
          db.prepare(`
            INSERT INTO student_enrollments (id, school_id, student_id, class_id, academic_year_id, promotion_status)
            VALUES (?, ?, ?, ?, ?, 'Active')
            ON CONFLICT(school_id, student_id, academic_year_id) DO UPDATE SET class_id = excluded.class_id
          `).run(newUuid(), schoolId, req.params.id, current_class_id, currentYear.id);
        }
      }
    });
    tx();
    res.json({ success: true });
  });

  router.post('/students/promote', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const { studentIds, targetClassId, targetAcademicYearId } = req.body || {};
    if (!Array.isArray(studentIds) || studentIds.length === 0 || !targetClassId || !targetAcademicYearId) {
      res.status(400).json({ error: 'Student IDs, target class, and academic year are required.' });
      return;
    }
    const tx = db.transaction(() => {
      for (const sid of studentIds) {
        db.prepare(`UPDATE student_enrollments SET promotion_status = 'Promoted' WHERE school_id = ? AND student_id = ? AND promotion_status = 'Active'`).run(
          schoolId, sid
        );
        db.prepare(`
          INSERT INTO student_enrollments (id, school_id, student_id, class_id, academic_year_id, promotion_status)
          VALUES (?, ?, ?, ?, ?, 'Active')
          ON CONFLICT(school_id, student_id, academic_year_id) DO UPDATE SET class_id = excluded.class_id, promotion_status = 'Active'
        `).run(newUuid(), schoolId, sid, targetClassId, targetAcademicYearId);
        db.prepare(`UPDATE students SET current_class_id = ?, updated_at = datetime('now') WHERE id = ? AND school_id = ?`).run(
          targetClassId, sid, schoolId
        );
      }
      logAudit(schoolId, req.user!.id, 'PROMOTE_STUDENTS', 'students', null, { count: studentIds.length, targetClassId });
    });
    tx();
    res.json({ promoted: studentIds.length });
  });

  router.delete('/students/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM students WHERE id = ? AND school_id = ?').run(req.params.id, req.schoolId!);
    logAudit(req.schoolId!, req.user!.id, 'DELETE_STUDENT', 'students', req.params.id);
    res.json({ success: true });
  });

  // ==================== TEACHERS ====================
  router.get('/teachers', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const teachers = db.prepare('SELECT * FROM teachers WHERE school_id = ? ORDER BY surname ASC, first_name ASC').all(schoolId) as Record<
      string,
      unknown
    >[];
    const tsRows = db
      .prepare(
        `SELECT ts.teacher_id, sub.id, sub.name, sub.subject_code
         FROM teacher_subjects ts JOIN subjects sub ON sub.id = ts.subject_id
         WHERE ts.school_id = ?`
      )
      .all(schoolId) as { teacher_id: string; id: string; name: string; subject_code: string }[];
    const classRows = db
      .prepare(
        `SELECT DISTINCT c.id, c.name, COALESCE(cs.teacher_id, c.class_teacher_id) as teacher_id
         FROM classes c
         LEFT JOIN class_subjects cs ON cs.class_id = c.id
         WHERE c.school_id = ? AND (c.class_teacher_id IS NOT NULL OR cs.teacher_id IS NOT NULL)`
      )
      .all(schoolId) as { id: string; name: string; teacher_id: string }[];

    const enriched = teachers.map((t) => {
      const subs = tsRows.filter((r) => r.teacher_id === t.id).map(({ id, name, subject_code }) => ({ id, name, subject_code }));
      const clsMap = new Map<string, { id: string; name: string }>();
      classRows.filter((c) => c.teacher_id === t.id).forEach((c) => clsMap.set(c.id, { id: c.id, name: c.name }));
      return {
        ...t,
        assigned_subjects: subs,
        assigned_subject_ids: subs.map((s) => s.id),
        assigned_classes: Array.from(clsMap.values()),
        assigned_class_ids: Array.from(clsMap.keys()),
      };
    });
    res.json(enriched);
  });

  router.post('/teachers', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const {
      first_name,
      middle_name = '',
      surname,
      gender,
      phone = '',
      email = '',
      address = '',
      academic_qualification = '',
      first_appointment_date = null,
      current_rank = 'Senior Superintendent II',
      date_promoted = null,
      employment_status = 'Active',
      photo_url = '',
      assigned_subject_ids = [],
    } = req.body || {};

    if (!first_name || !surname || !gender) {
      res.status(400).json({ error: 'First name, surname, and gender are required.' });
      return;
    }

    const settings = db.prepare('SELECT teacher_id_prefix FROM school_settings WHERE school_id = ?').get(schoolId) as
      | { teacher_id_prefix: string }
      | undefined;
    const prefix = settings?.teacher_id_prefix || 'TCH';
    const countRow = db.prepare('SELECT COUNT(*) as c FROM teachers WHERE school_id = ?').get(schoolId) as { c: number };
    const teacherCode = `${prefix}-${String(countRow.c + 1).padStart(4, '0')}`;
    const teacherId = newUuid();

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO teachers (
          id, school_id, teacher_code, first_name, middle_name, surname, gender,
          phone, email, address, academic_qualification,
          first_appointment_date, current_rank, date_promoted, employment_status, photo_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        teacherId, schoolId, teacherCode, first_name.trim(), middle_name.trim(), surname.trim(), gender,
        phone, email, address, academic_qualification,
        first_appointment_date || null, current_rank, date_promoted || null, employment_status, photo_url
      );

      if (Array.isArray(assigned_subject_ids)) {
        for (const sid of assigned_subject_ids) {
          db.prepare(`INSERT OR IGNORE INTO teacher_subjects (id, school_id, teacher_id, subject_id) VALUES (?, ?, ?, ?)`).run(
            newUuid(), schoolId, teacherId, sid
          );
        }
      }
      logAudit(schoolId, req.user!.id, 'CREATE_TEACHER', 'teachers', teacherId, { teacherCode });
    });
    tx();
    res.status(201).json({ id: teacherId, teacher_code: teacherCode });
  });

  router.put('/teachers/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const {
      first_name,
      middle_name,
      surname,
      gender,
      phone,
      email,
      address,
      academic_qualification,
      first_appointment_date,
      current_rank,
      date_promoted,
      employment_status,
      photo_url,
      assigned_subject_ids,
    } = req.body || {};

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE teachers
        SET first_name = COALESCE(?, first_name),
            middle_name = COALESCE(?, middle_name),
            surname = COALESCE(?, surname),
            gender = COALESCE(?, gender),
            phone = COALESCE(?, phone),
            email = COALESCE(?, email),
            address = COALESCE(?, address),
            academic_qualification = COALESCE(?, academic_qualification),
            first_appointment_date = ?,
            current_rank = COALESCE(?, current_rank),
            date_promoted = ?,
            employment_status = COALESCE(?, employment_status),
            photo_url = COALESCE(?, photo_url),
            updated_at = datetime('now')
        WHERE id = ? AND school_id = ?
      `).run(
        first_name ?? null,
        middle_name ?? null,
        surname ?? null,
        gender ?? null,
        phone ?? null,
        email ?? null,
        address ?? null,
        academic_qualification ?? null,
        first_appointment_date || null,
        current_rank ?? null,
        date_promoted || null,
        employment_status ?? null,
        photo_url ?? null,
        req.params.id,
        schoolId
      );

      if (Array.isArray(assigned_subject_ids)) {
        db.prepare('DELETE FROM teacher_subjects WHERE teacher_id = ? AND school_id = ?').run(req.params.id, schoolId);
        for (const sid of assigned_subject_ids) {
          db.prepare('INSERT OR IGNORE INTO teacher_subjects (id, school_id, teacher_id, subject_id) VALUES (?, ?, ?, ?)').run(
            newUuid(), schoolId, req.params.id, sid
          );
        }
      }
    });
    tx();
    res.json({ success: true });
  });

  router.delete('/teachers/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM teachers WHERE id = ? AND school_id = ?').run(req.params.id, req.schoolId!);
    res.json({ success: true });
  });

  // ==================== SUBJECTS & CLASS ASSIGNMENTS ====================
  router.get('/subjects', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const subjects = db.prepare('SELECT * FROM subjects WHERE school_id = ? ORDER BY name ASC').all(schoolId) as Record<string, unknown>[];
    const assignments = db
      .prepare(
        `SELECT cs.*, c.name as class_name, sub.name as subject_name, sub.subject_code,
                t.first_name || ' ' || t.surname as teacher_name
         FROM class_subjects cs
         JOIN classes c ON c.id = cs.class_id
         JOIN subjects sub ON sub.id = cs.subject_id
         LEFT JOIN teachers t ON t.id = cs.teacher_id
         WHERE cs.school_id = ?
         ORDER BY c.level_number ASC, c.name ASC`
      )
      .all(schoolId) as Record<string, unknown>[];

    res.json(
      subjects.map((sub) => ({
        ...sub,
        is_core: Boolean(sub.is_core),
        assignments: assignments.filter((a) => a.subject_id === sub.id),
      }))
    );
  });

  router.post('/subjects', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const { name, subject_code, description = '', is_core = true, status = 'Active' } = req.body || {};
    if (!name || !subject_code) {
      res.status(400).json({ error: 'Subject name and subject code are required.' });
      return;
    }
    const dup = db
      .prepare('SELECT id FROM subjects WHERE school_id = ? AND (lower(subject_code) = lower(?) OR lower(name) = lower(?))')
      .get(schoolId, subject_code.trim(), name.trim());
    if (dup) {
      res.status(409).json({ error: 'A subject with this name or code already exists in your school.' });
      return;
    }
    const id = newUuid();
    db.prepare(`INSERT INTO subjects (id, school_id, subject_code, name, description, is_core, status) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      id, schoolId, subject_code.trim().toUpperCase(), name.trim(), description, is_core ? 1 : 0, status
    );
    res.status(201).json({ id });
  });

  router.put('/subjects/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const { name, subject_code, description, is_core, status } = req.body || {};
    db.prepare(`
      UPDATE subjects
      SET name = COALESCE(?, name),
          subject_code = COALESCE(?, subject_code),
          description = COALESCE(?, description),
          is_core = COALESCE(?, is_core),
          status = COALESCE(?, status),
          updated_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(name ?? null, subject_code ? subject_code.trim().toUpperCase() : null, description ?? null, is_core === undefined ? null : is_core ? 1 : 0, status ?? null, req.params.id, req.schoolId!);
    res.json({ success: true });
  });

  router.delete('/subjects/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    try {
      db.prepare('DELETE FROM subjects WHERE id = ? AND school_id = ?').run(req.params.id, req.schoolId!);
      res.json({ success: true });
    } catch {
      res.status(409).json({ error: 'Cannot delete subject because it has recorded student results.' });
    }
  });

  router.get('/class-subjects', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT cs.*, c.name as class_name, sub.name as subject_name, sub.subject_code,
                t.first_name || ' ' || t.surname as teacher_name
         FROM class_subjects cs
         JOIN classes c ON c.id = cs.class_id
         JOIN subjects sub ON sub.id = cs.subject_id
         LEFT JOIN teachers t ON t.id = cs.teacher_id
         WHERE cs.school_id = ?
         ORDER BY c.level_number ASC, sub.name ASC`
      )
      .all(req.schoolId!);
    res.json(rows);
  });

  router.post('/class-subjects', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const { class_id, subject_id, teacher_id = null } = req.body || {};
    if (!class_id || !subject_id) {
      res.status(400).json({ error: 'Class and subject are required.' });
      return;
    }
    const existing = db
      .prepare('SELECT id FROM class_subjects WHERE school_id = ? AND class_id = ? AND subject_id = ?')
      .get(schoolId, class_id, subject_id);
    if (existing) {
      res.status(409).json({ error: 'This subject is already assigned to the selected class.' });
      return;
    }
    const id = newUuid();
    db.prepare(`INSERT INTO class_subjects (id, school_id, class_id, subject_id, teacher_id) VALUES (?, ?, ?, ?, ?)`).run(
      id, schoolId, class_id, subject_id, teacher_id || null
    );
    if (teacher_id) {
      db.prepare(`INSERT OR IGNORE INTO teacher_subjects (id, school_id, teacher_id, subject_id) VALUES (?, ?, ?, ?)`).run(
        newUuid(), schoolId, teacher_id, subject_id
      );
    }
    res.status(201).json({ id });
  });

  router.put('/class-subjects/:id', requireAuth, (req: AuthedRequest, res) => {
    const { teacher_id } = req.body || {};
    db.prepare(`UPDATE class_subjects SET teacher_id = ?, updated_at = datetime('now') WHERE id = ? AND school_id = ?`).run(
      teacher_id || null, req.params.id, req.schoolId!
    );
    res.json({ success: true });
  });

  router.delete('/class-subjects/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM class_subjects WHERE id = ? AND school_id = ?').run(req.params.id, req.schoolId!);
    res.json({ success: true });
  });

  // ==================== CLASSES ====================
  router.get('/classes', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const query = `
      SELECT c.*,
             t.first_name || ' ' || t.surname as class_teacher_name,
             (SELECT COUNT(*) FROM students st WHERE st.current_class_id = c.id AND st.status = 'Active') as student_count,
             (SELECT COUNT(*) FROM class_subjects cs WHERE cs.class_id = c.id) as subject_count
      FROM classes c
      LEFT JOIN teachers t ON t.id = c.class_teacher_id
      WHERE c.school_id = ?
      ORDER BY c.level_number ASC, c.name ASC
    `;
    const rows = db.prepare(query).all(schoolId) as Record<string, unknown>[];
    res.json(rows.map((r) => ({ ...r, is_active: Boolean(r.is_active) })));
  });

  router.post('/classes', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const { name, level_number, stream = '', class_teacher_id = null, capacity = 45 } = req.body || {};
    if (!name || !level_number) {
      res.status(400).json({ error: 'Class name and level (1–9) are required.' });
      return;
    }
    const dup = db.prepare('SELECT id FROM classes WHERE school_id = ? AND lower(name) = lower(?)').get(schoolId, name.trim());
    if (dup) {
      res.status(409).json({ error: 'A class with this name already exists.' });
      return;
    }
    const effectiveTeacherId = class_teacher_id || (req.role === 'teacher' ? req.teacherRecordId : null) || null;
    const id = newUuid();
    db.prepare(`
      INSERT INTO classes (id, school_id, name, level_number, stream, class_teacher_id, capacity, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(id, schoolId, name.trim(), Number(level_number), stream.trim(), effectiveTeacherId, Number(capacity) || 45);
    res.status(201).json({ id });
  });

  router.put('/classes/:id', requireAuth, (req: AuthedRequest, res) => {
    const { name, level_number, stream, class_teacher_id, capacity, is_active } = req.body || {};
    db.prepare(`
      UPDATE classes
      SET name = COALESCE(?, name),
          level_number = COALESCE(?, level_number),
          stream = COALESCE(?, stream),
          class_teacher_id = ?,
          capacity = COALESCE(?, capacity),
          is_active = COALESCE(?, is_active),
          updated_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(
      name ?? null,
      level_number ?? null,
      stream ?? null,
      class_teacher_id || null,
      capacity ?? null,
      is_active === undefined ? null : is_active ? 1 : 0,
      req.params.id,
      req.schoolId!
    );
    res.json({ success: true });
  });

  router.delete('/classes/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    try {
      db.prepare('DELETE FROM classes WHERE id = ? AND school_id = ?').run(req.params.id, req.schoolId!);
      res.json({ success: true });
    } catch {
      res.status(409).json({ error: 'Cannot delete class with historical enrollments or results. Deactivate it instead.' });
    }
  });

  // ==================== RESULTS & GRADING ====================
  router.get('/results', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const { academicYearId, termId, classId, subjectId } = req.query as Record<string, string | undefined>;
    let query = `
      SELECT r.*, st.student_code, st.first_name || ' ' || st.surname as student_name,
             c.name as class_name, sub.name as subject_name, sub.subject_code, t.name as term_name
      FROM results r
      JOIN students st ON st.id = r.student_id
      JOIN classes c ON c.id = r.class_id
      JOIN subjects sub ON sub.id = r.subject_id
      JOIN terms t ON t.id = r.term_id
      WHERE r.school_id = ?
    `;
    const params: unknown[] = [schoolId];
    if (academicYearId) {
      query += ' AND r.academic_year_id = ?';
      params.push(academicYearId);
    }
    if (termId) {
      query += ' AND r.term_id = ?';
      params.push(termId);
    }
    if (classId) {
      query += ' AND r.class_id = ?';
      params.push(classId);
    }
    if (subjectId) {
      query += ' AND r.subject_id = ?';
      params.push(subjectId);
    }
    if (req.role === 'teacher') {
      const accessible = getTeacherAccessibleClassIds(schoolId, req.teacherRecordId);
      if (accessible.length === 0) {
        res.json([]);
        return;
      }
      query += ` AND r.class_id IN (${accessible.map(() => '?').join(',')})`;
      params.push(...accessible);
    }
    query += ' ORDER BY st.surname ASC, st.first_name ASC, sub.name ASC';
    const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
    res.json(rows.map((r) => ({ ...r, is_locked: Boolean(r.is_locked) })));
  });

  router.post('/results/bulk', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const { academic_year_id, term_id, class_id, subject_id, entries } = req.body || {};
    if (!academic_year_id || !term_id || !class_id || !subject_id || !Array.isArray(entries)) {
      res.status(400).json({ error: 'Academic year, term, class, subject, and entries are required.' });
      return;
    }

    const assess = db
      .prepare('SELECT class_exercise_max, homework_max, project_max, exam_max FROM assessments WHERE school_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1')
      .get(schoolId) as { class_exercise_max: number; homework_max: number; project_max: number; exam_max: number } | undefined;

    const maxCe = assess?.class_exercise_max ?? 10;
    const maxHw = assess?.homework_max ?? 10;
    const maxPr = assess?.project_max ?? 10;
    const maxEx = assess?.exam_max ?? 70;

    const scales = db
      .prepare('SELECT grade, min_score, max_score, remark FROM grading_scales WHERE school_id = ? ORDER BY min_score DESC')
      .all(schoolId) as { grade: string; min_score: number; max_score: number; remark: string }[];

    const lookupGrade = (score: number) => {
      for (const s of scales) {
        if (score >= s.min_score && score <= s.max_score + 0.001) return { grade: s.grade, remark: s.remark };
      }
      return { grade: 'F', remark: 'Fail' };
    };

    try {
      const tx = db.transaction(() => {
        for (const item of entries) {
          const ce = Number(item.class_exercise) || 0;
          const hw = Number(item.homework) || 0;
          const pr = Number(item.project) || 0;
          const ex = Number(item.exam) || 0;

          if (ce < 0 || ce > maxCe || hw < 0 || hw > maxHw || pr < 0 || pr > maxPr || ex < 0 || ex > maxEx) {
            throw new Error(`Marks exceed maximum allowed (${maxCe}/${maxHw}/${maxPr}/${maxEx}).`);
          }

          const existing = db
            .prepare(
              `SELECT id, is_locked FROM results
               WHERE school_id = ? AND student_id = ? AND subject_id = ? AND academic_year_id = ? AND term_id = ?`
            )
            .get(schoolId, item.student_id, subject_id, academic_year_id, term_id) as { id: string; is_locked: number } | undefined;

          if (existing?.is_locked) {
            throw new Error('One or more selected results are locked and cannot be modified until unlocked by an administrator.');
          }

          const total = Math.round((ce + hw + pr + ex) * 100) / 100;
          const { grade, remark } = lookupGrade(total);

          if (existing) {
            db.prepare(`
              UPDATE results
              SET class_exercise = ?, homework = ?, project = ?, exam = ?,
                  total_score = ?, grade = ?, remarks = ?, recorded_by = ?, updated_at = datetime('now')
              WHERE id = ?
            `).run(ce, hw, pr, ex, total, grade, remark, req.user!.id, existing.id);
          } else {
            db.prepare(`
              INSERT INTO results (
                id, school_id, student_id, class_id, subject_id, academic_year_id, term_id,
                class_exercise, homework, project, exam, total_score, grade, remarks, is_locked, recorded_by
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            `).run(
              newUuid(), schoolId, item.student_id, class_id, subject_id, academic_year_id, term_id,
              ce, hw, pr, ex, total, grade, remark, req.user!.id
            );
          }
        }
        logAudit(schoolId, req.user!.id, 'UPSERT_RESULTS_BULK', 'results', null, { class_id, subject_id, count: entries.length });
      });
      tx();
      res.json({ saved: entries.length });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save results.' });
    }
  });

  router.post('/results/lock', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const { academic_year_id, term_id, class_id, subject_id, locked } = req.body || {};
    let sql = 'UPDATE results SET is_locked = ?, updated_at = datetime("now") WHERE school_id = ? AND academic_year_id = ? AND term_id = ? AND class_id = ?';
    const params: unknown[] = [locked ? 1 : 0, schoolId, academic_year_id, term_id, class_id];
    if (subject_id) {
      sql += ' AND subject_id = ?';
      params.push(subject_id);
    }
    const info = db.prepare(sql).run(...params);
    res.json({ updated: info.changes });
  });

  router.delete('/results/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const row = db.prepare('SELECT is_locked FROM results WHERE id = ? AND school_id = ?').get(req.params.id, req.schoolId!) as
      | { is_locked: number }
      | undefined;
    if (row?.is_locked) {
      res.status(400).json({ error: 'Unlock this result before deleting.' });
      return;
    }
    db.prepare('DELETE FROM results WHERE id = ? AND school_id = ?').run(req.params.id, req.schoolId!);
    res.json({ success: true });
  });

  // ==================== ATTENDANCE ====================
  router.get('/attendance', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const { classId, date, academicYearId, termId, studentId } = req.query as Record<string, string | undefined>;
    let sql = `
      SELECT a.*, st.student_code, st.first_name || ' ' || st.surname as student_name, st.gender, c.name as class_name
      FROM attendance a
      JOIN students st ON st.id = a.student_id
      JOIN classes c ON c.id = a.class_id
      WHERE a.school_id = ?
    `;
    const params: unknown[] = [schoolId];
    if (classId) {
      sql += ' AND a.class_id = ?';
      params.push(classId);
    }
    if (date) {
      sql += ' AND a.attendance_date = ?';
      params.push(date);
    }
    if (academicYearId) {
      sql += ' AND a.academic_year_id = ?';
      params.push(academicYearId);
    }
    if (termId) {
      sql += ' AND a.term_id = ?';
      params.push(termId);
    }
    if (studentId) {
      sql += ' AND a.student_id = ?';
      params.push(studentId);
    }
    if (req.role === 'teacher') {
      const accessible = getTeacherAccessibleClassIds(schoolId, req.teacherRecordId);
      if (accessible.length === 0) {
        res.json([]);
        return;
      }
      sql += ` AND a.class_id IN (${accessible.map(() => '?').join(',')})`;
      params.push(...accessible);
    }
    sql += ' ORDER BY a.attendance_date DESC, st.surname ASC';
    res.json(db.prepare(sql).all(...params));
  });

  router.post('/attendance/bulk', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const { class_id, academic_year_id, term_id, attendance_date, entries } = req.body || {};
    if (!class_id || !academic_year_id || !term_id || !attendance_date || !Array.isArray(entries)) {
      res.status(400).json({ error: 'Class, academic year, term, date, and entries are required.' });
      return;
    }
    if (req.role === 'teacher') {
      const accessible = getTeacherAccessibleClassIds(schoolId, req.teacherRecordId);
      if (!accessible.includes(class_id)) {
        res.status(403).json({ error: 'You are not assigned to this class.' });
        return;
      }
    }
    const tx = db.transaction(() => {
      for (const item of entries) {
        db.prepare(`
          INSERT INTO attendance (id, school_id, student_id, class_id, academic_year_id, term_id, attendance_date, status, remarks, recorded_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(school_id, student_id, attendance_date)
          DO UPDATE SET status = excluded.status, remarks = excluded.remarks, recorded_by = excluded.recorded_by, updated_at = datetime('now')
        `).run(
          newUuid(), schoolId, item.student_id, class_id, academic_year_id, term_id, attendance_date,
          item.status === 'Absent' ? 'Absent' : 'Present', item.remarks || '', req.user!.id
        );
      }
    });
    tx();
    res.json({ saved: entries.length });
  });

  // ==================== REPORTS & REPORT CARDS ====================
  router.get('/reports/cards', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const { academicYearId, termId, classId } = req.query as Record<string, string | undefined>;
    if (!academicYearId || !termId || !classId) {
      res.status(400).json({ error: 'academicYearId, termId, and classId are required.' });
      return;
    }

    const school = db.prepare('SELECT * FROM schools WHERE id = ?').get(schoolId) as Record<string, unknown>;
    const settings = db.prepare('SELECT * FROM school_settings WHERE school_id = ?').get(schoolId) as Record<string, unknown>;
    const academicYear = db.prepare('SELECT * FROM academic_years WHERE id = ? AND school_id = ?').get(academicYearId, schoolId);
    const term = db.prepare('SELECT * FROM terms WHERE id = ? AND school_id = ?').get(termId, schoolId);
    const schoolClass = db
      .prepare(`SELECT c.*, t.first_name || ' ' || t.surname as class_teacher_name FROM classes c LEFT JOIN teachers t ON t.id = c.class_teacher_id WHERE c.id = ? AND c.school_id = ?`)
      .get(classId, schoolId);

    const students = db
      .prepare(
        `SELECT s.*, c.name as class_name, g.full_name as guardian_name, g.phone as guardian_phone, g.address as guardian_address
         FROM students s
         LEFT JOIN classes c ON c.id = s.current_class_id
         LEFT JOIN guardians g ON g.id = s.guardian_id
         WHERE s.school_id = ? AND s.current_class_id = ?
         ORDER BY s.surname ASC, s.first_name ASC`
      )
      .all(schoolId, classId) as { id: string }[];

    const results = db
      .prepare(
        `SELECT r.*, sub.name as subject_name, sub.subject_code
         FROM results r
         JOIN subjects sub ON sub.id = r.subject_id
         WHERE r.school_id = ? AND r.class_id = ? AND r.academic_year_id = ? AND r.term_id = ?
         ORDER BY sub.name ASC`
      )
      .all(schoolId, classId, academicYearId, termId) as {
      student_id: string;
      subject_id: string;
      subject_name: string;
      subject_code: string;
      class_exercise: number;
      homework: number;
      project: number;
      exam: number;
      total_score: number;
      grade: string;
      remarks: string;
    }[];

    // Subject averages across the class
    const subjectTotals = new Map<string, { sum: number; count: number }>();
    for (const r of results) {
      const cur = subjectTotals.get(r.subject_id) || { sum: 0, count: 0 };
      cur.sum += r.total_score;
      cur.count += 1;
      subjectTotals.set(r.subject_id, cur);
    }

    // Compute student averages for ranking with proper tie handling
    const avgByStudent = students.map((st) => {
      const stRes = results.filter((r) => r.student_id === st.id);
      const sum = stRes.reduce((acc, r) => acc + r.total_score, 0);
      const avg = stRes.length > 0 ? Math.round((sum / stRes.length) * 100) / 100 : 0;
      return { id: st.id, avg, sum };
    });

    const sortedAvgs = [...avgByStudent].sort((a, b) => b.avg - a.avg);
    const rankMap = new Map<string, number>();
    sortedAvgs.forEach((item, idx) => {
      if (idx > 0 && sortedAvgs[idx - 1].avg === item.avg) {
        rankMap.set(item.id, rankMap.get(sortedAvgs[idx - 1].id)!);
      } else {
        rankMap.set(item.id, idx + 1);
      }
    });

    const attendanceAll = db
      .prepare(`SELECT student_id, status FROM attendance WHERE school_id = ? AND class_id = ? AND academic_year_id = ? AND term_id = ?`)
      .all(schoolId, classId, academicYearId, termId) as { student_id: string; status: string }[];

    const commentsAll = db
      .prepare(`SELECT * FROM report_comments WHERE school_id = ? AND class_id = ? AND academic_year_id = ? AND term_id = ?`)
      .all(schoolId, classId, academicYearId, termId) as { student_id: string }[];

    const cards = students.map((st) => {
      const stRes = results.filter((r) => r.student_id === st.id);
      const stAtt = attendanceAll.filter((a) => a.student_id === st.id);
      const presentDays = stAtt.filter((a) => a.status === 'Present').length;
      const totalDays = stAtt.length;
      const avgInfo = avgByStudent.find((a) => a.id === st.id)!;
      const comment = commentsAll.find((c) => c.student_id === st.id) || null;

      return {
        school: { ...school, is_active: Boolean(school.is_active) },
        settings: {
          ...settings,
          allow_teacher_result_lock: Boolean(settings.allow_teacher_result_lock),
          show_class_position_on_report: Boolean(settings.show_class_position_on_report),
        },
        academicYear,
        term,
        student: st,
        schoolClass,
        subjects: stRes.map((r) => {
          const subStat = subjectTotals.get(r.subject_id);
          return {
            subject_id: r.subject_id,
            subject_name: r.subject_name,
            subject_code: r.subject_code,
            class_exercise: r.class_exercise,
            homework: r.homework,
            project: r.project,
            sba_total: Math.round((r.class_exercise + r.homework + r.project) * 100) / 100,
            exam: r.exam,
            total_score: r.total_score,
            grade: r.grade,
            remarks: r.remarks,
            subject_average: subStat ? Math.round((subStat.sum / subStat.count) * 10) / 10 : 0,
          };
        }),
        overallAverage: avgInfo.avg,
        totalScoreSum: Math.round(avgInfo.sum * 100) / 100,
        classPosition: stRes.length > 0 ? rankMap.get(st.id) || 0 : 0,
        classSize: students.length,
        attendance: {
          presentDays,
          absentDays: totalDays - presentDays,
          totalDays,
          percentage: totalDays > 0 ? Math.round((presentDays / totalDays) * 1000) / 10 : 0,
        },
        comment,
      };
    });

    res.json(cards);
  });

  router.post('/reports/comments', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const {
      student_id,
      class_id,
      academic_year_id,
      term_id,
      conduct = 'Satisfactory',
      attitude = 'Hardworking',
      interest = 'Reading & Mathematics',
      class_teacher_comment = '',
      headteacher_comment = '',
      is_published = false,
    } = req.body || {};

    db.prepare(`
      INSERT INTO report_comments (
        id, school_id, student_id, class_id, academic_year_id, term_id,
        conduct, attitude, interest, class_teacher_comment, headteacher_comment, is_published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(school_id, student_id, academic_year_id, term_id)
      DO UPDATE SET conduct = excluded.conduct, attitude = excluded.attitude, interest = excluded.interest,
                    class_teacher_comment = excluded.class_teacher_comment, headteacher_comment = excluded.headteacher_comment,
                    is_published = excluded.is_published, updated_at = datetime('now')
    `).run(
      newUuid(), schoolId, student_id, class_id, academic_year_id, term_id,
      conduct, attitude, interest, class_teacher_comment, headteacher_comment, is_published ? 1 : 0
    );
    res.json({ success: true });
  });

  router.get('/reports/general', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const { academicYearId, termId } = req.query as Record<string, string | undefined>;

    const enrollmentByClass = db
      .prepare(
        `SELECT c.name as class_name, c.level_number,
                COUNT(st.id) as total,
                COUNT(CASE WHEN st.gender = 'Male' THEN 1 END) as male,
                COUNT(CASE WHEN st.gender = 'Female' THEN 1 END) as female
         FROM classes c
         LEFT JOIN students st ON st.current_class_id = c.id AND st.status = 'Active'
         WHERE c.school_id = ?
         GROUP BY c.id, c.name, c.level_number
         ORDER BY c.level_number ASC, c.name ASC`
      )
      .all(schoolId);

    const classPerformance = db
      .prepare(
        `SELECT c.name as class_name, COUNT(DISTINCT r.student_id) as students_assessed,
                ROUND(AVG(r.total_score), 1) as average_score,
                MAX(r.total_score) as highest_score, MIN(r.total_score) as lowest_score
         FROM classes c
         LEFT JOIN results r ON r.class_id = c.id
           ${academicYearId ? 'AND r.academic_year_id = ?' : ''}
           ${termId ? 'AND r.term_id = ?' : ''}
         WHERE c.school_id = ?
         GROUP BY c.id, c.name, c.level_number
         ORDER BY c.level_number ASC`
      )
      .all(...(academicYearId ? [academicYearId] : []), ...(termId ? [termId] : []), schoolId);

    res.json({ enrollmentByClass, classPerformance });
  });

  // ==================== SETTINGS, GRADING, ASSESSMENTS & USERS ====================
  router.get('/settings', requireAuth, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const school = db.prepare('SELECT * FROM schools WHERE id = ?').get(schoolId) as Record<string, unknown>;
    const settings = db.prepare('SELECT * FROM school_settings WHERE school_id = ?').get(schoolId) as Record<string, unknown>;
    const assessment = db
      .prepare('SELECT * FROM assessments WHERE school_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1')
      .get(schoolId) as Record<string, unknown>;
    const gradingScale = db.prepare('SELECT * FROM grading_scales WHERE school_id = ? ORDER BY sort_order ASC').all(schoolId);

    let users: Record<string, unknown>[] = [];
    if (req.role === 'super_admin' || req.role === 'school_admin') {
      users = db
        .prepare(
          `SELECT m.id, m.school_id, m.user_id, m.role, m.is_active,
                  p.email, p.full_name, p.phone, p.is_super_admin
           FROM school_memberships m
           JOIN profiles p ON p.id = m.user_id
           WHERE m.school_id = ?
           ORDER BY p.full_name ASC`
        )
        .all(schoolId) as Record<string, unknown>[];
    }

    res.json({
      school: { ...school, is_active: Boolean(school.is_active) },
      settings: settings
        ? {
            ...settings,
            allow_teacher_result_lock: Boolean(settings.allow_teacher_result_lock),
            show_class_position_on_report: Boolean(settings.show_class_position_on_report),
          }
        : null,
      assessment: assessment ? { ...assessment, is_active: Boolean(assessment.is_active) } : null,
      gradingScale,
      users: users.map((u) => ({
        ...u,
        is_active: Boolean(u.is_active),
        is_super_admin: Boolean(u.is_super_admin),
      })),
    });
  });

  router.put('/settings/school', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const {
      name,
      motto,
      address,
      region,
      district,
      phone,
      email,
      logo_url,
      headteacher_name,
      student_id_prefix,
      teacher_id_prefix,
      default_class_teacher_comment,
      default_headteacher_comment,
      show_class_position_on_report,
    } = req.body || {};

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE schools
        SET name = COALESCE(?, name),
            motto = COALESCE(?, motto),
            address = COALESCE(?, address),
            region = COALESCE(?, region),
            district = COALESCE(?, district),
            phone = COALESCE(?, phone),
            email = COALESCE(?, email),
            logo_url = COALESCE(?, logo_url),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(name ?? null, motto ?? null, address ?? null, region ?? null, district ?? null, phone ?? null, email ?? null, logo_url ?? null, schoolId);

      db.prepare(`
        UPDATE school_settings
        SET headteacher_name = COALESCE(?, headteacher_name),
            student_id_prefix = COALESCE(?, student_id_prefix),
            teacher_id_prefix = COALESCE(?, teacher_id_prefix),
            default_class_teacher_comment = COALESCE(?, default_class_teacher_comment),
            default_headteacher_comment = COALESCE(?, default_headteacher_comment),
            show_class_position_on_report = COALESCE(?, show_class_position_on_report),
            updated_at = datetime('now')
        WHERE school_id = ?
      `).run(
        headteacher_name ?? null,
        student_id_prefix ?? null,
        teacher_id_prefix ?? null,
        default_class_teacher_comment ?? null,
        default_headteacher_comment ?? null,
        show_class_position_on_report === undefined ? null : show_class_position_on_report ? 1 : 0,
        schoolId
      );
    });
    tx();
    res.json({ success: true });
  });

  router.put('/settings/assessment', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const { class_exercise_max, homework_max, project_max, exam_max } = req.body || {};
    const sum = Number(class_exercise_max) + Number(homework_max) + Number(project_max) + Number(exam_max);
    if (Math.abs(sum - 100) > 0.01) {
      res.status(400).json({ error: 'Assessment component weights must total exactly 100 marks.' });
      return;
    }
    db.prepare(`
      UPDATE assessments
      SET class_exercise_max = ?, homework_max = ?, project_max = ?, exam_max = ?, updated_at = datetime('now')
      WHERE school_id = ? AND is_active = 1
    `).run(Number(class_exercise_max), Number(homework_max), Number(project_max), Number(exam_max), schoolId);
    res.json({ success: true });
  });

  router.put('/settings/grading', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const { scales } = req.body || {};
    if (!Array.isArray(scales) || scales.length === 0) {
      res.status(400).json({ error: 'Grading scale entries are required.' });
      return;
    }
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM grading_scales WHERE school_id = ?').run(schoolId);
      scales.forEach((s: { grade: string; min_score: number; max_score: number; remark: string }, idx: number) => {
        db.prepare(`
          INSERT INTO grading_scales (id, school_id, grade, min_score, max_score, remark, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(newUuid(), schoolId, s.grade.trim(), Number(s.min_score), Number(s.max_score), s.remark.trim(), idx + 1);
      });
    });
    tx();
    res.json({ success: true });
  });

  router.post('/settings/users', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const schoolId = req.schoolId!;
    const { email, full_name, password, role, phone = '', link_teacher_id = null } = req.body || {};
    if (!email || !full_name || !role) {
      res.status(400).json({ error: 'Email, full name, and role are required.' });
      return;
    }
    if ((role === 'super_admin' || role === 'school_admin') && !req.user!.is_super_admin) {
      res.status(403).json({
        error: 'Only a Super Administrator can create or assign School Administrator or Super Administrator accounts.',
      });
      return;
    }
    if (!['school_admin', 'teacher', 'super_admin'].includes(role)) {
      res.status(400).json({ error: 'Invalid role.' });
      return;
    }
    const existing = db.prepare('SELECT id FROM profiles WHERE lower(email) = lower(?)').get(email.trim()) as { id: string } | undefined;
    if (!existing && (!password || String(password).length < 6)) {
      res.status(400).json({ error: 'A password of at least 6 characters is required for new accounts.' });
      return;
    }
    const userId = existing?.id || newUuid();

    const tx = db.transaction(() => {
      if (!existing) {
        db.prepare(`
          INSERT INTO profiles (id, email, password_hash, full_name, phone, is_super_admin, is_active)
          VALUES (?, ?, ?, ?, ?, ?, 1)
        `).run(userId, email.trim().toLowerCase(), hashPassword(password), full_name.trim(), phone, role === 'super_admin' ? 1 : 0);
      } else if (role === 'super_admin') {
        db.prepare('UPDATE profiles SET is_super_admin = 1 WHERE id = ?').run(userId);
      }
      db.prepare(`
        INSERT INTO school_memberships (id, school_id, user_id, role, is_active)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(school_id, user_id) DO UPDATE SET role = excluded.role, is_active = 1
      `).run(newUuid(), schoolId, userId, role);

      if (link_teacher_id) {
        db.prepare('UPDATE teachers SET user_id = ? WHERE id = ? AND school_id = ?').run(userId, link_teacher_id, schoolId);
      } else if (role === 'teacher') {
        db.prepare('UPDATE teachers SET user_id = ? WHERE school_id = ? AND lower(email) = lower(?) AND user_id IS NULL').run(
          userId,
          schoolId,
          email.trim()
        );
      }
    });
    tx();
    res.status(201).json({ userId, emailConfirmed: true });
  });

  router.put('/settings/users/:membershipId', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const { role, is_active } = req.body || {};
    const existing = db
      .prepare('SELECT id, user_id, role FROM school_memberships WHERE id = ? AND school_id = ?')
      .get(req.params.membershipId, req.schoolId!) as { id: string; user_id: string; role: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Membership record not found.' });
      return;
    }
    if (
      (role === 'super_admin' ||
        role === 'school_admin' ||
        existing.role === 'super_admin' ||
        existing.role === 'school_admin') &&
      !req.user!.is_super_admin
    ) {
      res.status(403).json({
        error: 'Only a Super Administrator can grant or modify School Administrator or Super Administrator privileges.',
      });
      return;
    }
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE school_memberships
        SET role = COALESCE(?, role),
            is_active = COALESCE(?, is_active),
            updated_at = datetime('now')
        WHERE id = ? AND school_id = ?
      `).run(role ?? null, is_active === undefined ? null : is_active ? 1 : 0, req.params.membershipId, req.schoolId!);

      if (role === 'super_admin') {
        db.prepare('UPDATE profiles SET is_super_admin = 1 WHERE id = ?').run(existing.user_id);
      } else if (role && existing.role === 'super_admin' && role !== 'super_admin') {
        const other = db
          .prepare(`SELECT 1 FROM school_memberships WHERE user_id = ? AND role = 'super_admin' AND is_active = 1`)
          .get(existing.user_id);
        if (!other) {
          db.prepare('UPDATE profiles SET is_super_admin = 0 WHERE id = ?').run(existing.user_id);
        }
      }
    });
    tx();
    res.json({ success: true });
  });

  return router;
}
