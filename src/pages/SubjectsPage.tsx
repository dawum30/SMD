import React, { useEffect, useMemo, useState } from 'react';
import { Link2, Pencil, Plus, Search, Trash2, Unlink } from 'lucide-react';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { SchoolClass, Subject, Teacher } from '../types/database';
import { formatFullName } from '../utils/grading';

export function SubjectsPage() {
  const { isAdmin, activeSchool } = useAuth();
  const { notify } = useToast();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Create/Edit Subject Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    subject_code: '',
    name: '',
    description: '',
    is_core: true,
    status: 'Active' as 'Active' | 'Inactive',
  });
  const [saving, setSaving] = useState(false);

  // Assign Subject to Class & Teacher Modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({
    subject_id: '',
    class_id: '',
    teacher_id: '',
  });

  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [sList, cList, tList] = await Promise.all([
        api.getSubjects(),
        api.getClasses(),
        api.getTeachers(),
      ]);
      setSubjects(sList);
      setClasses(cList);
      setTeachers(tList);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to load subjects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSchool) loadAll();
  }, [activeSchool]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.subject_code.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
    );
  }, [subjects, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ subject_code: '', name: '', description: '', is_core: true, status: 'Active' });
    setFormOpen(true);
  };

  const openEdit = (sub: Subject) => {
    setEditingId(sub.id);
    setForm({
      subject_code: sub.subject_code,
      name: sub.name,
      description: sub.description || '',
      is_core: sub.is_core,
      status: sub.status,
    });
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.updateSubject(editingId, form);
        notify('success', 'Subject updated.');
      } else {
        await api.createSubject(form);
        notify('success', 'Subject created.');
      }
      setFormOpen(false);
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to save subject.');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.assignSubjectToClass({
        subject_id: assignForm.subject_id,
        class_id: assignForm.class_id,
        teacher_id: assignForm.teacher_id || null,
      });
      notify('success', 'Subject assigned to class.');
      setAssignOpen(false);
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Assignment failed.');
    }
  };

  const handleUnassign = async (assignmentId: string) => {
    try {
      await api.removeClassSubject(assignmentId);
      notify('info', 'Class subject assignment removed.');
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to remove assignment.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteSubject(deleteTarget.id);
      notify('success', 'Subject deleted.');
      setDeleteTarget(null);
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Cannot delete subject.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">Subjects &amp; Curriculum Mapping</h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage GES subjects and assign subject teachers per class without duplicates.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAssignForm({
                  subject_id: subjects[0]?.id || '',
                  class_id: classes.find((c) => c.name.includes('Basic 3'))?.id || classes[0]?.id || '',
                  teacher_id: teachers[0]?.id || '',
                });
                setAssignOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <Link2 className="w-4 h-4" />
              <span>Assign to Class</span>
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-950 rounded-lg hover:bg-emerald-900 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Add Subject</span>
            </button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subjects by name or code..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800"
          />
        </div>
      </div>

      {/* Subject List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Subject Name &amp; Description</th>
                <th className="py-3 px-4">Class &amp; Teacher Assignments</th>
                <th className="py-3 px-4">Status</th>
                {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="py-4 px-4">
                      <div className="h-5 bg-slate-100 animate-pulse rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 px-4 text-center text-slate-500">
                    No subjects found.
                  </td>
                </tr>
              ) : (
                filtered.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/70 align-top">
                    <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                      {sub.subject_code}
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="font-medium text-slate-900">{sub.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{sub.description || 'No description'}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      {sub.assignments && sub.assignments.length > 0 ? (
                        <div className="space-y-1 text-xs">
                          {sub.assignments.map((a) => (
                            <div key={a.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1 last:border-0">
                              <span className="text-slate-700">
                                <strong className="text-slate-900">{a.class_name}</strong> ·{' '}
                                {a.teacher_name || 'Unassigned Teacher'}
                              </span>
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleUnassign(a.id)}
                                  className="text-slate-400 hover:text-red-700"
                                  title="Remove class assignment"
                                >
                                  <Unlink className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Not assigned to any class</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-xs font-medium ${
                          sub.status === 'Active' ? 'text-emerald-800' : 'text-slate-500'
                        }`}
                      >
                        {sub.status} · {sub.is_core ? 'Core' : 'Elective'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEdit(sub)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                          title="Edit subject"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(sub)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50"
                          title="Delete subject"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Subject Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Subject' : 'Create Subject'}
        maxWidth="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Subject Code *</label>
              <input
                type="text"
                required
                value={form.subject_code}
                onChange={(e) => setForm({ ...form, subject_code: e.target.value.toUpperCase() })}
                placeholder="ENG"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Subject Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="English Language"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
              <select
                value={form.is_core ? 'core' : 'elective'}
                onChange={(e) => setForm({ ...form, is_core: e.target.value === 'core' })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="core">Core Subject</option>
                <option value="elective">Elective Subject</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'Active' | 'Inactive' })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
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
              {saving ? 'Saving...' : editingId ? 'Update Subject' : 'Create Subject'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign Subject to Class Modal */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign Subject to Class"
        subtitle="Duplicate subject assignments within the same class are automatically prevented."
        maxWidth="md"
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Class *</label>
            <select
              required
              value={assignForm.class_id}
              onChange={(e) => setAssignForm({ ...assignForm, class_id: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Subject *</label>
            <select
              required
              value={assignForm.subject_id}
              onChange={(e) => setAssignForm({ ...assignForm, subject_id: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.subject_code} — {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Subject Teacher</label>
            <select
              value={assignForm.teacher_id}
              onChange={(e) => setAssignForm({ ...assignForm, teacher_id: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Unassigned</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {formatFullName(t.first_name, t.middle_name, t.surname)} ({t.teacher_code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setAssignOpen(false)}
              className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-semibold bg-emerald-950 text-white rounded-lg hover:bg-emerald-900"
            >
              Assign Subject
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Subject"
        message={`Delete ${deleteTarget?.name} (${deleteTarget?.subject_code})? Subjects with existing student results cannot be deleted.`}
      />
    </div>
  );
}
