import { db, hashPassword, newUuid } from './db';

export function seedInitialDatabase(): void {
  const existingSchools = db.prepare('SELECT COUNT(*) as c FROM schools').get() as { c: number };
  if (existingSchools.c > 0) return;

  const tx = db.transaction(() => {
    // 1. Primary Ghanaian Basic School
    const schoolId = newUuid();
    db.prepare(`
      INSERT INTO schools (id, name, code, motto, address, region, district, phone, email, logo_url, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      schoolId,
      'Accra Ridge Basic School',
      'ARBS-001',
      'Knowledge, Character & Unity',
      '14 Independence Avenue, Ridge, Accra',
      'Greater Accra',
      'Accra Metropolitan',
      '+233 30 222 4890',
      'admin@accraridgebasic.edu.gh',
      '/crest-default.jpg'
    );

    // 2. School Settings
    db.prepare(`
      INSERT INTO school_settings (
        id, school_id, student_id_prefix, teacher_id_prefix,
        default_class_teacher_comment, default_headteacher_comment,
        headteacher_name, allow_teacher_result_lock, show_class_position_on_report
      ) VALUES (?, ?, 'ARBS', 'TCH', ?, ?, ?, 0, 1)
    `).run(
      newUuid(),
      schoolId,
      'Commendable effort throughout the term. Continue practicing daily reading and problem solving.',
      'Satisfactory academic and moral progress. Parents are encouraged to supervise home assignments.',
      'Mrs. Abena Mensah-Bonsu'
    );

    // 3. Assessment Structure (10 / 10 / 10 / 70)
    db.prepare(`
      INSERT INTO assessments (id, school_id, academic_year_id, name, class_exercise_max, homework_max, project_max, exam_max, is_active)
      VALUES (?, ?, NULL, 'GES Standard SBA + End of Term Exam', 10, 10, 10, 70, 1)
    `).run(newUuid(), schoolId);

    // 4. Grading Scale (A - F)
    const scales = [
      { grade: 'A', min: 80, max: 100, remark: 'Excellent', order: 1 },
      { grade: 'B', min: 70, max: 79.99, remark: 'Very Good', order: 2 },
      { grade: 'C', min: 60, max: 69.99, remark: 'Good', order: 3 },
      { grade: 'D', min: 50, max: 59.99, remark: 'Credit', order: 4 },
      { grade: 'E', min: 40, max: 49.99, remark: 'Pass', order: 5 },
      { grade: 'F', min: 0, max: 39.99, remark: 'Fail', order: 6 },
    ];
    for (const s of scales) {
      db.prepare(`
        INSERT INTO grading_scales (id, school_id, grade, min_score, max_score, remark, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(newUuid(), schoolId, s.grade, s.min, s.max, s.remark, s.order);
    }

    // 5. Academic Year & Terms
    const yearId = newUuid();
    db.prepare(`
      INSERT INTO academic_years (id, school_id, name, start_date, end_date, is_current)
      VALUES (?, ?, '2025/2026', '2025-09-08', '2026-07-24', 1)
    `).run(yearId, schoolId);

    const term1Id = newUuid();
    const term2Id = newUuid();
    const term3Id = newUuid();
    db.prepare(`
      INSERT INTO terms (id, school_id, academic_year_id, name, term_number, start_date, end_date, next_reopening_date, is_current)
      VALUES (?, ?, ?, 'Term 1', 1, '2025-09-08', '2025-12-18', '2026-01-12', 0)
    `).run(term1Id, schoolId, yearId);
    db.prepare(`
      INSERT INTO terms (id, school_id, academic_year_id, name, term_number, start_date, end_date, next_reopening_date, is_current)
      VALUES (?, ?, ?, 'Term 2', 2, '2026-01-12', '2026-04-02', '2026-04-27', 1)
    `).run(term2Id, schoolId, yearId);
    db.prepare(`
      INSERT INTO terms (id, school_id, academic_year_id, name, term_number, start_date, end_date, next_reopening_date, is_current)
      VALUES (?, ?, ?, 'Term 3', 3, '2026-04-27', '2026-07-24', '2026-09-07', 0)
    `).run(term3Id, schoolId, yearId);

    // 6. Users (Super Admin, School Admin, Teacher)
    const superAdminId = newUuid();
    const schoolAdminId = newUuid();
    const teacherUserId = newUuid();

    db.prepare(`
      INSERT INTO profiles (id, email, password_hash, full_name, phone, is_super_admin, is_active)
      VALUES (?, ?, ?, ?, ?, 1, 1)
    `).run(superAdminId, 'superadmin@akwaabasms.gh', hashPassword('SMD10011'), 'Dr. Kwame Boateng', '+233 24 100 0001');

    db.prepare(`
      INSERT INTO profiles (id, email, password_hash, full_name, phone, is_super_admin, is_active)
      VALUES (?, ?, ?, ?, ?, 0, 1)
    `).run(schoolAdminId, 'head@accraridgebasic.edu.gh', hashPassword('School@2026'), 'Mrs. Abena Mensah-Bonsu', '+233 24 412 8801');

    db.prepare(`
      INSERT INTO profiles (id, email, password_hash, full_name, phone, is_super_admin, is_active)
      VALUES (?, ?, ?, ?, ?, 0, 1)
    `).run(teacherUserId, 'kofi.owusu@accraridgebasic.edu.gh', hashPassword('Teacher@2026'), 'Mr. Kofi Owusu-Ansah', '+233 24 553 1920');

    db.prepare(`INSERT INTO school_memberships (id, school_id, user_id, role, is_active) VALUES (?, ?, ?, 'super_admin', 1)`).run(newUuid(), schoolId, superAdminId);
    db.prepare(`INSERT INTO school_memberships (id, school_id, user_id, role, is_active) VALUES (?, ?, ?, 'school_admin', 1)`).run(newUuid(), schoolId, schoolAdminId);
    db.prepare(`INSERT INTO school_memberships (id, school_id, user_id, role, is_active) VALUES (?, ?, ?, 'teacher', 1)`).run(newUuid(), schoolId, teacherUserId);

    // 7. Teachers (with Ghanaian GES fields)
    const teacher1Id = newUuid();
    const teacher2Id = newUuid();
    const teacher3Id = newUuid();

    db.prepare(`
      INSERT INTO teachers (
        id, school_id, user_id, teacher_code, first_name, middle_name, surname,
        gender, phone, email, address, academic_qualification,
        first_appointment_date, current_rank, date_promoted, employment_status
      ) VALUES (?, ?, ?, 'TCH-0001', 'Kofi', 'Mensah', 'Owusu-Ansah', 'Male', '+233 24 553 1920',
        'kofi.owusu@accraridgebasic.edu.gh', 'Adabraka, Accra', 'B.Ed Basic Education (UEW)',
        '2018-09-01', 'Principal Superintendent', '2023-09-01', 'Active')
    `).run(teacher1Id, schoolId, teacherUserId);

    db.prepare(`
      INSERT INTO teachers (
        id, school_id, user_id, teacher_code, first_name, middle_name, surname,
        gender, phone, email, address, academic_qualification,
        first_appointment_date, current_rank, date_promoted, employment_status
      ) VALUES (?, ?, NULL, 'TCH-0002', 'Efua', 'Serwaa', 'Darko', 'Female', '+233 20 882 3411',
        'efua.darko@accraridgebasic.edu.gh', 'Cantonments, Accra', 'B.Sc Mathematics Education (UCC)',
        '2020-09-01', 'Senior Superintendent I', '2024-09-01', 'Active')
    `).run(teacher2Id, schoolId);

    db.prepare(`
      INSERT INTO teachers (
        id, school_id, user_id, teacher_code, first_name, middle_name, surname,
        gender, phone, email, address, academic_qualification,
        first_appointment_date, current_rank, date_promoted, employment_status
      ) VALUES (?, ?, NULL, 'TCH-0003', 'Yaw', '', 'Tetteh', 'Male', '+233 54 319 7704',
        'yaw.tetteh@accraridgebasic.edu.gh', 'Osu RE, Accra', 'Diploma in Basic Education',
        '2022-01-10', 'Senior Superintendent II', '2022-01-10', 'Active')
    `).run(teacher3Id, schoolId);

    // 8. Classes (Basic 1 through Basic 9)
    const classIds: Record<number, string> = {};
    for (let lvl = 1; lvl <= 9; lvl++) {
      const cid = newUuid();
      classIds[lvl] = cid;
      const teacherForClass = lvl === 3 ? teacher1Id : lvl === 4 ? teacher2Id : lvl === 5 ? teacher3Id : null;
      db.prepare(`
        INSERT INTO classes (id, school_id, name, level_number, stream, class_teacher_id, capacity, is_active)
        VALUES (?, ?, ?, ?, '', ?, 40, 1)
      `).run(cid, schoolId, `Basic ${lvl}`, lvl, teacherForClass);
    }

    // 9. Ghanaian Basic School Subjects
    const subjectDefs = [
      { code: 'ENG', name: 'English Language', desc: 'Reading, grammar, composition, and oral literacy.', core: 1 },
      { code: 'MAT', name: 'Mathematics', desc: 'Number operations, geometry, measurement, and problem solving.', core: 1 },
      { code: 'SCI', name: 'Integrated Science', desc: 'Natural sciences, energy, living organisms, and environment.', core: 1 },
      { code: 'OWOP', name: 'Our World Our People', desc: 'Citizenship, culture, governance, and social values.', core: 1 },
      { code: 'GHL', name: 'Ghanaian Language (Twi)', desc: 'Asante Twi literacy, culture, and oral expression.', core: 1 },
      { code: 'RME', name: 'Religious & Moral Education', desc: 'Moral development, character, and Ghanaian religious heritage.', core: 1 },
      { code: 'CAD', name: 'Creative Arts & Design', desc: 'Visual arts, performing arts, and creative expression.', core: 0 },
      { code: 'ICT', name: 'Computing', desc: 'Digital literacy, basic computing, and safe technology use.', core: 0 },
    ];
    const subjectIds: Record<string, string> = {};
    for (const sub of subjectDefs) {
      const sid = newUuid();
      subjectIds[sub.code] = sid;
      db.prepare(`
        INSERT INTO subjects (id, school_id, subject_code, name, description, is_core, status)
        VALUES (?, ?, ?, ?, ?, ?, 'Active')
      `).run(sid, schoolId, sub.code, sub.name, sub.desc, sub.core);
    }

    // Assign subjects to Basic 3 (and teachers)
    const basic3Id = classIds[3];
    const basic3TeacherMap: Record<string, string> = {
      ENG: teacher1Id,
      MAT: teacher2Id,
      SCI: teacher2Id,
      OWOP: teacher1Id,
      GHL: teacher3Id,
      RME: teacher1Id,
      CAD: teacher3Id,
      ICT: teacher2Id,
    };

    for (const [code, sid] of Object.entries(subjectIds)) {
      const tid = basic3TeacherMap[code] || teacher1Id;
      db.prepare(`
        INSERT INTO class_subjects (id, school_id, class_id, subject_id, teacher_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(newUuid(), schoolId, basic3Id, sid, tid);

      db.prepare(`
        INSERT OR IGNORE INTO teacher_subjects (id, school_id, teacher_id, subject_id)
        VALUES (?, ?, ?, ?)
      `).run(newUuid(), schoolId, tid, sid);
    }

    // Assign core subjects to Basic 1, 2, 4, 5, 6 as well
    for (const lvl of [1, 2, 4, 5, 6]) {
      for (const code of ['ENG', 'MAT', 'SCI', 'OWOP', 'RME']) {
        db.prepare(`
          INSERT INTO class_subjects (id, school_id, class_id, subject_id, teacher_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(newUuid(), schoolId, classIds[lvl], subjectIds[code], lvl === 4 ? teacher2Id : teacher3Id);
      }
    }

    // 10. Basic 3 Students + Guardians + Enrollments + Results + Attendance
    const basic3Students = [
      { first: 'Ama', mid: 'Adoma', sur: 'Mensah', gender: 'Female', dob: '2017-03-14', gName: 'Mrs. Akosua Mensah', gPhone: '+233 24 331 9012', gAddr: 'Osu Ako-Adjei, Accra', scores: [9, 9, 9, 64] },
      { first: 'Kwabena', mid: 'Osei', sur: 'Appiah', gender: 'Male', dob: '2017-07-22', gName: 'Mr. Samuel Appiah', gPhone: '+233 20 718 4421', gAddr: 'Labone Junction, Accra', scores: [8, 8, 9, 58] },
      { first: 'Akua', mid: '', sur: 'Boateng', gender: 'Female', dob: '2017-01-09', gName: 'Madam Comfort Boateng', gPhone: '+233 55 901 2384', gAddr: 'Nima Residential, Accra', scores: [10, 9, 9, 66] },
      { first: 'Nii', mid: 'Lante', sur: 'Lamptey', gender: 'Male', dob: '2017-11-03', gName: 'Mr. Emmanuel Lamptey', gPhone: '+233 24 880 1277', gAddr: 'Jamestown, Accra', scores: [7, 7, 8, 49] },
      { first: 'Yaa', mid: 'Asantewaa', sur: 'Frimpong', gender: 'Female', dob: '2017-05-19', gName: 'Dr. Grace Frimpong', gPhone: '+233 26 441 7830', gAddr: 'Airport Residential, Accra', scores: [9, 10, 8, 61] },
      { first: 'Kojo', mid: 'Baffour', sur: 'Asante', gender: 'Male', dob: '2017-08-30', gName: 'Mr. Peter Asante', gPhone: '+233 24 667 9011', gAddr: 'Dzorwulu, Accra', scores: [6, 6, 7, 38] },
      { first: 'Abena', mid: 'Pokuaa', sur: 'Ofori', gender: 'Female', dob: '2017-02-25', gName: 'Mrs. Faustina Ofori', gPhone: '+233 50 112 6543', gAddr: 'Kanda Estates, Accra', scores: [8, 9, 8, 55] },
      { first: 'Kwasi', mid: '', sur: 'Nkrumah', gender: 'Male', dob: '2017-09-12', gName: 'Mr. Daniel Nkrumah', gPhone: '+233 24 998 3102', gAddr: 'Kokomlemle, Accra', scores: [7, 8, 7, 46] },
    ];

    const gradeLookup = (total: number) => {
      if (total >= 80) return { g: 'A', r: 'Excellent' };
      if (total >= 70) return { g: 'B', r: 'Very Good' };
      if (total >= 60) return { g: 'C', r: 'Good' };
      if (total >= 50) return { g: 'D', r: 'Credit' };
      if (total >= 40) return { g: 'E', r: 'Pass' };
      return { g: 'F', r: 'Fail' };
    };

    const subjectCodes = ['ENG', 'MAT', 'SCI', 'OWOP', 'GHL', 'RME'];
    const attendanceDates = ['2026-02-09', '2026-02-10', '2026-02-11', '2026-02-12', '2026-02-13'];

    basic3Students.forEach((st, idx) => {
      const guardianId = newUuid();
      db.prepare(`
        INSERT INTO guardians (id, school_id, full_name, relationship, phone, address)
        VALUES (?, ?, ?, 'Parent', ?, ?)
      `).run(guardianId, schoolId, st.gName, st.gPhone, st.gAddr);

      const studentId = newUuid();
      const studentCode = `ARBS-2025-${String(idx + 1).padStart(4, '0')}`;
      db.prepare(`
        INSERT INTO students (
          id, school_id, student_code, first_name, middle_name, surname,
          gender, date_of_birth, admission_date, current_class_id, guardian_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2025-09-08', ?, ?, 'Active')
      `).run(studentId, schoolId, studentCode, st.first, st.mid, st.sur, st.gender, st.dob, basic3Id, guardianId);

      db.prepare(`
        INSERT INTO student_enrollments (id, school_id, student_id, class_id, academic_year_id, enrolled_at, promotion_status)
        VALUES (?, ?, ?, ?, ?, '2025-09-08', 'Active')
      `).run(newUuid(), schoolId, studentId, basic3Id, yearId);

      // Seed Term 1 and Term 2 results across subjects so charts & report cards have real multi-term data
      subjectCodes.forEach((code, sIdx) => {
        const subId = subjectIds[code];
        const [ceBase, hwBase, prBase, exBase] = st.scores;
        // Term 1 (slightly lower baseline)
        const ce1 = Math.max(0, Math.min(10, ceBase - (sIdx % 2)));
        const hw1 = Math.max(0, Math.min(10, hwBase - ((sIdx + 1) % 2)));
        const pr1 = Math.max(0, Math.min(10, prBase - (sIdx % 2)));
        const ex1 = Math.max(0, Math.min(70, exBase - 4 + ((idx + sIdx) % 5)));
        const tot1 = ce1 + hw1 + pr1 + ex1;
        const g1 = gradeLookup(tot1);

        db.prepare(`
          INSERT INTO results (
            id, school_id, student_id, class_id, subject_id, academic_year_id, term_id,
            class_exercise, homework, project, exam, total_score, grade, remarks, is_locked, recorded_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `).run(newUuid(), schoolId, studentId, basic3Id, subId, yearId, term1Id, ce1, hw1, pr1, ex1, tot1, g1.g, g1.r, schoolAdminId);

        // Term 2 (current active term)
        const ce2 = Math.max(0, Math.min(10, ceBase));
        const hw2 = Math.max(0, Math.min(10, hwBase));
        const pr2 = Math.max(0, Math.min(10, prBase));
        const ex2 = Math.max(0, Math.min(70, exBase + ((sIdx * 3 - idx) % 6)));
        const tot2 = ce2 + hw2 + pr2 + ex2;
        const g2 = gradeLookup(tot2);

        db.prepare(`
          INSERT INTO results (
            id, school_id, student_id, class_id, subject_id, academic_year_id, term_id,
            class_exercise, homework, project, exam, total_score, grade, remarks, is_locked, recorded_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        `).run(newUuid(), schoolId, studentId, basic3Id, subId, yearId, term2Id, ce2, hw2, pr2, ex2, tot2, g2.g, g2.r, teacherUserId);
      });

      // Seed 5 days of attendance in Term 2
      attendanceDates.forEach((dt, dIdx) => {
        const isAbsent = (idx === 5 && dIdx === 2) || (idx === 3 && dIdx === 4);
        db.prepare(`
          INSERT INTO attendance (
            id, school_id, student_id, class_id, academic_year_id, term_id, attendance_date, status, recorded_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(newUuid(), schoolId, studentId, basic3Id, yearId, term2Id, dt, isAbsent ? 'Absent' : 'Present', teacherUserId);
      });

      // Seed report comment for Term 2
      db.prepare(`
        INSERT INTO report_comments (
          id, school_id, student_id, class_id, academic_year_id, term_id,
          conduct, attitude, interest, class_teacher_comment, headteacher_comment, is_published
        ) VALUES (?, ?, ?, ?, ?, ?, 'Respectful & Disciplined', 'Attentive in class', 'Reading & Science', ?, ?, 0)
      `).run(
        newUuid(),
        schoolId,
        studentId,
        basic3Id,
        yearId,
        term2Id,
        'Demonstrates steady growth across core Basic 3 literacy and numeracy milestones.',
        'Keep up the positive attitude toward classwork and school activities.'
      );
    });
  });

  tx();
}
