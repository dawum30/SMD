import React, { useEffect, useState } from 'react';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import {
  ClassSubjectAssignment,
  ResultRecord,
  SchoolClass,
  Student,
  Subject,
  Teacher,
} from '../types/database';
import { formatFullName } from '../utils/grading';

export function ClassesPage() {
  const { isAdmin, activeSchool, session } = useAuth();
  const { notify } = useToast();

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubjectAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    level_number: 3,
    stream: '',
    class_teacher_id: '',
    capacity: 45,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SchoolClass | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Class Detail View Modal
  const [detailClass, setDetailClass] = useState<SchoolClass | null>(null);
  const [detailResults, setDetailResults] = useState<ResultRecord[]>([]);
  const [addSubId, setAddSubId] = useState('');
  const [addSubTeacherId, setAddSubTeacherId] = useState('');
  const [assignStuId, setAssignStuId] = useState('');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cList, tList, sList, subList, csList] = await Promise.all([
        api.getClasses(),
        api.getTeachers(),
        api.getStudents(),
        api.getSubjects(),
        api.getClassSubjects(),
      ]);
      setClasses(cList);
      setTeachers(tList);
      setStudents(sList);
      setSubjects(subList);
      setClassSubjects(csList);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to load classes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSchool) loadAll();
  }, [activeSchool]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: '',
      level_number: 3,
      stream: '',
      class_teacher_id: session?.teacherRecordId || '',
      capacity: 45,
      is_active: true,
    });
    setFormOpen(true);
  };

  const openEdit = (c: SchoolClass) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      level_number: c.level_number,
      stream: c.stream || '',
      class_teacher_id: c.class_teacher_id || '',
      capacity: c.capacity,
      is_active: c.is_active,
    });
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, class_teacher_id: form.class_teacher_id || null };
      if (editingId) {
        await api.updateClass(editingId, payload);
        notify('success', 'Class updated.');
      } else {
        await api.createClass(payload);
        notify('success', 'Class created.');
      }
      setFormOpen(false);
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to save class.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteClass(deleteTarget.id);
      notify('success', 'Class deleted.');
      setDeleteTarget(null);
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to delete class.');
    } finally {
      setDeleting(false);
    }
  };

  const openDetail = async (c: SchoolClass) => {
    setDetailClass(c);
    setAddSubId(subjects[0]?.id || '');
    setAddSubTeacherId(teachers[0]?.id || '');
    setAssignStuId('');
    try {
      const res = await api.getResults({ classId: c.id });
      setDetailResults(res);
    } catch {
      setDetailResults([]);
    }
  };

  const handleAddSubjectToClass = async () => {
    if (!detailClass || !addSubId) return;
    try {
      await api.assignSubjectToClass({
        class_id: detailClass.id,
        subject_id: addSubId,
        teacher_id: addSubTeacherId || null,
      });
      notify('success', 'Subject assigned to class.');
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to assign subject.');
    }
  };

  const handleAssignStudentToClass = async () => {
    if (!detailClass || !assignStuId) return;
    try {
      await api.updateStudent(assignStuId, { current_class_id: detailClass.id });
      notify('success', 'Student enrolled in class.');
      setAssignStuId('');
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to assign student.');
    }
  };

  const detailStudents = detailClass ? students.filter((s) => s.current_class_id === detailClass.id) : [];
  const otherStudents = detailClass ? students.filter((s) => s.current_class_id !== detailClass.id) : [];
  const detailSubjects = detailClass ? classSubjects.filter((cs) => cs.class_id === detailClass.id) : [];
  const detailAverage =
    detailResults.length > 0
      ? (detailResults.reduce((acc, r) => acc + Number(r.total_score), 0) / detailResults.length).toFixed(1)
      : '—';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">Classes (Basic 1 – Basic 9)</h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage class streams, class teachers, subject allocations, and student rosters.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-950 rounded-lg hover:bg-emerald-900 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Create Class</span>
        </button>
      </div>

      {/* Classes Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
          No classes configured yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((c) => (
            <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 font-display">{c.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Level {c.level_number} {c.stream ? `· Stream ${c.stream}` : ''} ·{' '}
                      {c.is_active ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openDetail(c)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-900 hover:bg-slate-100"
                      title="Inspect class roster & subjects"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                      title="Edit class"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(c)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50"
                        title="Delete class"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Class Teacher</span>
                    <span className="font-medium text-slate-900">{c.class_teacher_name || 'Unassigned'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Enrollment</span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {c.student_count ?? 0} / {c.capacity}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Assigned Subjects</span>
                    <span className="font-mono tabular-nums text-slate-900">{c.subject_count ?? 0}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openDetail(c)}
                className="mt-4 w-full py-2 text-xs font-semibold text-emerald-950 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
              >
                View Roster &amp; Performance
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Class Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Class' : 'Create New Class'}
        maxWidth="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Basic Level (1–9) *</label>
              <select
                value={form.level_number}
                onChange={(e) => setForm({ ...form, level_number: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
                  <option key={lvl} value={lvl}>
                    Basic {lvl}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Stream (optional)</label>
              <input
                type="text"
                value={form.stream}
                onChange={(e) => setForm({ ...form, stream: e.target.value })}
                placeholder="e.g. A, B, Gold"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Class Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={`Basic ${form.level_number}${form.stream ? form.stream : ''}`}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Class Teacher</label>
              <select
                value={form.class_teacher_id}
                onChange={(e) => setForm({ ...form, class_teacher_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Unassigned</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {formatFullName(t.first_name, t.middle_name, t.surname)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Capacity</label>
              <input
                type="number"
                min={1}
                max={120}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold bg-emerald-950 text-white rounded-lg hover:bg-emerald-900"
            >
              {saving ? 'Saving...' : editingId ? 'Update Class' : 'Create Class'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Class Detail Modal */}
      <Modal
        open={Boolean(detailClass)}
        onClose={() => setDetailClass(null)}
        title={detailClass ? `${detailClass.name} — Roster & Performance` : ''}
        subtitle={
          detailClass
            ? `Class Teacher: ${detailClass.class_teacher_name || 'Unassigned'} · Mean Assessment Score: ${detailAverage}%`
            : ''
        }
        maxWidth="4xl"
      >
        {detailClass && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Enrolled Students */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">
                    Enrolled Students ({detailStudents.length})
                  </h4>
                </div>
                {otherStudents.length > 0 && (
                  <div className="flex gap-2">
                    <select
                      value={assignStuId}
                      onChange={(e) => setAssignStuId(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Assign existing student to {detailClass.name}...</option>
                      {otherStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {formatFullName(s.first_name, s.middle_name, s.surname)} ({s.class_name || 'Unassigned'})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!assignStuId}
                      onClick={handleAssignStudentToClass}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-950 text-white rounded-lg disabled:opacity-40"
                    >
                      Enroll
                    </button>
                  </div>
                )}
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto text-sm">
                  {detailStudents.length === 0 ? (
                    <p className="p-4 text-xs text-slate-400">No students currently enrolled in this class.</p>
                  ) : (
                    detailStudents.map((s) => (
                      <div key={s.id} className="px-3 py-2 flex items-center justify-between">
                        <span className="font-medium text-slate-900">
                          {formatFullName(s.first_name, s.middle_name, s.surname)}
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          {s.student_code} · {s.gender}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Class Subjects */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-900">
                  Class Subjects ({detailSubjects.length})
                </h4>
                {subjects.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={addSubId}
                      onChange={(e) => setAddSubId(e.target.value)}
                      className="flex-1 min-w-[130px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      {subjects.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={addSubTeacherId}
                      onChange={(e) => setAddSubTeacherId(e.target.value)}
                      className="flex-1 min-w-[130px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">No Teacher</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {formatFullName(t.first_name, t.middle_name, t.surname)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddSubjectToClass}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-950 text-white rounded-lg"
                    >
                      Add
                    </button>
                  </div>
                )}
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto text-sm">
                  {detailSubjects.length === 0 ? (
                    <p className="p-4 text-xs text-slate-400">No subjects assigned to this class yet.</p>
                  ) : (
                    detailSubjects.map((cs) => (
                      <div key={cs.id} className="px-3 py-2 flex items-center justify-between">
                        <div>
                          <span className="font-medium text-slate-900">{cs.subject_name}</span>
                          <span className="text-xs font-mono text-slate-500 ml-2">{cs.subject_code}</span>
                        </div>
                        <span className="text-xs text-slate-600">{cs.teacher_name || 'Unassigned'}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Class"
        message={`Delete ${deleteTarget?.name}? Classes with historical enrollments or results cannot be deleted.`}
      />
    </div>
  );
}
