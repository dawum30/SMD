import React, { useEffect, useMemo, useState } from 'react';
import { Download, Eye, Pencil, Plus, Printer, Search, Trash2, Upload } from 'lucide-react';
import { Avatar } from '../components/ui/Avatar';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { Subject, Teacher, UserRole } from '../types/database';
import { downloadCSV, formatFullName } from '../utils/grading';

const GES_RANKS = [
  'Superintendent II',
  'Superintendent I',
  'Senior Superintendent II',
  'Senior Superintendent I',
  'Principal Superintendent',
  'Assistant Director II',
  'Assistant Director I',
  'Deputy Director',
];

const emptyTeacherForm = {
  first_name: '',
  middle_name: '',
  surname: '',
  gender: 'Female' as 'Male' | 'Female',
  phone: '',
  email: '',
  address: '',
  academic_qualification: 'B.Ed Basic Education',
  gha_number: '',
  first_appointment_date: '',
  current_rank: 'Senior Superintendent II',
  date_promoted: '',
  employment_status: 'Active' as Teacher['employment_status'],
  photo_url: '',
  assigned_subject_ids: [] as string[],
};

export function TeachersPage() {
  const { isAdmin, isSuperAdmin, activeSchool } = useAuth();
  const { notify } = useToast();

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingHasAccount, setEditingHasAccount] = useState(false);
  const [form, setForm] = useState(emptyTeacherForm);
  const [createPortalLogin, setCreatePortalLogin] = useState(false);
  const [portalRole, setPortalRole] = useState<UserRole>('teacher');
  const [portalPassword, setPortalPassword] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  const [viewTeacher, setViewTeacher] = useState<Teacher | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [tList, sList] = await Promise.all([api.getTeachers(), api.getSubjects()]);
      setTeachers(tList);
      setSubjects(sList);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to load teachers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSchool) loadAll();
  }, [activeSchool]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teachers.filter((t) => {
      if (statusFilter && t.employment_status !== statusFilter) return false;
      if (genderFilter && t.gender !== genderFilter) return false;
      if (!q) return true;
      const full = formatFullName(t.first_name, t.middle_name, t.surname).toLowerCase();
      return (
        full.includes(q) ||
        t.teacher_code.toLowerCase().includes(q) ||
        t.gha_number.toLowerCase().includes(q) ||
        t.current_rank.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q)
      );
    });
  }, [teachers, search, statusFilter, genderFilter]);

  const openCreate = () => {
    setEditingId(null);
    setEditingHasAccount(false);
    setForm(emptyTeacherForm);
    setCreatePortalLogin(false);
    setPortalRole('teacher');
    setPortalPassword('');
    setFormOpen(true);
  };

  const openEdit = (t: Teacher) => {
    setEditingId(t.id);
    setEditingHasAccount(Boolean(t.user_id));
    setCreatePortalLogin(false);
    setPortalRole('teacher');
    setPortalPassword('');
    setForm({
      first_name: t.first_name,
      middle_name: t.middle_name || '',
      surname: t.surname,
      gender: t.gender,
      phone: t.phone || '',
      email: t.email || '',
      address: t.address || '',
      academic_qualification: t.academic_qualification || '',
      gha_number: t.gha_number || '',
      first_appointment_date: t.first_appointment_date || '',
      current_rank: t.current_rank || 'Senior Superintendent II',
      date_promoted: t.date_promoted || '',
      employment_status: t.employment_status,
      photo_url: t.photo_url || '',
      assigned_subject_ids: t.assigned_subject_ids || [],
    });
    setFormOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const url = await api.uploadImage(file, 'teacher-photos');
      setForm((f) => ({ ...f, photo_url: url }));
      notify('success', 'Teacher photograph uploaded.');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const toggleSubject = (subId: string) => {
    setForm((f) => ({
      ...f,
      assigned_subject_ids: f.assigned_subject_ids.includes(subId)
        ? f.assigned_subject_ids.filter((x) => x !== subId)
        : [...f.assigned_subject_ids, subId],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createPortalLogin && !form.email.trim()) {
      notify('error', 'Email address is required when creating a portal login account.');
      return;
    }
    setSaving(true);
    try {
      let teacherId = editingId;
      if (editingId) {
        await api.updateTeacher(editingId, form);
        notify('success', 'Teacher record updated.');
      } else {
        const created = await api.createTeacher(form);
        teacherId = created.id;
        notify('success', 'Teacher registered.');
      }

      if (createPortalLogin && teacherId) {
        const userRes = await api.createUserMembership({
          email: form.email.trim(),
          full_name: formatFullName(form.first_name, form.middle_name, form.surname),
          password: portalPassword.trim() || undefined,
          phone: form.phone,
          role: portalRole,
          link_teacher_id: teacherId,
        });
        notify(userRes.emailConfirmed ? 'success' : 'info', userRes.message);
      }

      setFormOpen(false);
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to save teacher.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteTeacher(deleteTarget.id);
      notify('success', 'Teacher record deleted.');
      setDeleteTarget(null);
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to delete teacher.');
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = () => {
    downloadCSV(
      `teachers-${activeSchool?.code || 'export'}.csv`,
      ['Teacher ID', 'Name', 'Gender', 'Phone', 'Email', 'Qualification', 'GHA Number', 'Rank', 'First Appt', 'Promoted', 'Status'],
      filtered.map((t) => [
        t.teacher_code,
        formatFullName(t.first_name, t.middle_name, t.surname),
        t.gender,
        t.phone,
        t.email,
        t.academic_qualification,
        t.gha_number,
        t.current_rank,
        t.first_appointment_date || '',
        t.date_promoted || '',
        t.employment_status,
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">Teachers &amp; Staff Directory</h2>
          <p className="text-sm text-slate-500 mt-1">
            {filtered.length} staff member{filtered.length === 1 ? '' : 's'} · GES rank &amp; GHA number records
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>Print Records</span>
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-950 rounded-lg hover:bg-emerald-900 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Add Teacher</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 no-print">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, ID, GHA number, rank..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800"
          />
        </div>
        <select
          value={genderFilter}
          onChange={(e) => setGenderFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
        >
          <option value="">All Genders</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
        >
          <option value="">All Employment Statuses</option>
          <option value="Active">Active</option>
          <option value="On Leave">On Leave</option>
          <option value="Transferred">Transferred</option>
          <option value="Retired">Retired</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Teacher</th>
                <th className="py-3 px-4">Teacher ID / GHA No.</th>
                <th className="py-3 px-4">Rank &amp; Qualification</th>
                <th className="py-3 px-4">Assigned Subjects &amp; Classes</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right no-print">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={idx}>
                    <td colSpan={6} className="py-4 px-4">
                      <div className="h-5 bg-slate-100 animate-pulse rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 px-4 text-center text-slate-500">
                    No teachers found matching your filter.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const fullName = formatFullName(t.first_name, t.middle_name, t.surname);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar src={t.photo_url} name={fullName} size="sm" />
                          <div>
                            <button
                              type="button"
                              onClick={() => setViewTeacher(t)}
                              className="font-medium text-slate-900 hover:text-emerald-900 text-left"
                            >
                              {fullName}
                            </button>
                            <p className="text-xs text-slate-500">
                              {t.phone || t.email || '—'}
                              {t.user_id && <span className="ml-1.5 text-emerald-700 font-medium">· Portal Active</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums">
                        <p className="text-slate-900 font-medium">{t.teacher_code}</p>
                        <p className="text-slate-500">{t.gha_number || 'No GHA No.'}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-slate-900 text-sm">{t.current_rank}</p>
                        <p className="text-xs text-slate-500">{t.academic_qualification || '—'}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-xs">
                        <p className="truncate">
                          <span className="font-medium text-slate-800">Subjects:</span>{' '}
                          {t.assigned_subjects?.length
                            ? t.assigned_subjects.map((s) => s.subject_code).join(', ')
                            : 'None'}
                        </p>
                        <p className="truncate mt-0.5">
                          <span className="font-medium text-slate-800">Classes:</span>{' '}
                          {t.assigned_classes?.length ? t.assigned_classes.map((c) => c.name).join(', ') : 'None'}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs font-medium ${
                            t.employment_status === 'Active' ? 'text-emerald-800' : 'text-amber-700'
                          }`}
                        >
                          {t.employment_status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap no-print">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewTeacher(t)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-900 hover:bg-slate-100"
                            title="View teacher details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(t)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                                title="Edit teacher"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(t)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50"
                                title="Delete teacher"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Teacher Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Teacher Profile' : 'Register New Teacher'}
        subtitle="Teacher ID is automatically assigned upon creation."
        maxWidth="2xl"
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar src={form.photo_url} name={`${form.first_name} ${form.surname}`} size="xl" />
            <div>
              <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingPhoto ? 'Uploading...' : 'Upload Photograph'}</span>
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
              <p className="text-xs text-slate-500 mt-1">Staff passport photograph (max 5 MB).</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">First Name *</label>
              <input
                type="text"
                required
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Middle Name</label>
              <input
                type="text"
                value={form.middle_name}
                onChange={(e) => setForm({ ...form, middle_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Surname *</label>
              <input
                type="text"
                required
                value={form.surname}
                onChange={(e) => setForm({ ...form, surname: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Gender *</label>
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value as 'Male' | 'Female' })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Female">Female</option>
                <option value="Male">Male</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Residential Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Academic Qualification</label>
              <input
                type="text"
                value={form.academic_qualification}
                onChange={(e) => setForm({ ...form, academic_qualification: e.target.value })}
                placeholder="e.g. B.Ed Basic Education (UEW)"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">GHA Number</label>
              <input
                type="text"
                value={form.gha_number}
                onChange={(e) => setForm({ ...form, gha_number: e.target.value })}
                placeholder="GHA-000000000-0"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Current GES Rank</label>
              <select
                value={form.current_rank}
                onChange={(e) => setForm({ ...form, current_rank: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {GES_RANKS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Employment Status</label>
              <select
                value={form.employment_status}
                onChange={(e) => setForm({ ...form, employment_status: e.target.value as Teacher['employment_status'] })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Transferred">Transferred</option>
                <option value="Retired">Retired</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">First Appointment Date</label>
              <input
                type="date"
                value={form.first_appointment_date}
                onChange={(e) => setForm({ ...form, first_appointment_date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Date Promoted</label>
              <input
                type="date"
                value={form.date_promoted}
                onChange={(e) => setForm({ ...form, date_promoted: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Assigned Subjects</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto">
              {subjects.map((sub) => (
                <label key={sub.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.assigned_subject_ids.includes(sub.id)}
                    onChange={() => toggleSubject(sub.id)}
                  />
                  <span className="truncate">{sub.name}</span>
                </label>
              ))}
            </div>
          </div>

          {isAdmin && !editingHasAccount && (
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70 space-y-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createPortalLogin}
                  onChange={(e) => setCreatePortalLogin(e.target.checked)}
                />
                <span>Grant portal login access for this teacher</span>
              </label>

              {createPortalLogin && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Portal Role *</label>
                    <select
                      value={portalRole}
                      onChange={(e) => setPortalRole(e.target.value as UserRole)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="teacher">Teacher</option>
                      <option value="school_admin">School Administrator</option>
                      {isSuperAdmin && <option value="super_admin">Super Administrator</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Login Password (min. 6 chars, or blank if existing)
                    </label>
                    <input
                      type="password"
                      minLength={6}
                      value={portalPassword}
                      onChange={(e) => setPortalPassword(e.target.value)}
                      placeholder="Set initial password"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

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
              className="px-4 py-2 text-sm font-semibold bg-emerald-950 text-white rounded-lg hover:bg-emerald-900 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Update Teacher' : 'Register Teacher'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Teacher Profile Modal */}
      <Modal
        open={Boolean(viewTeacher)}
        onClose={() => setViewTeacher(null)}
        title="Teacher Profile & Teaching Assignments"
        maxWidth="2xl"
      >
        {viewTeacher && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 pb-4 border-b border-slate-200">
              <Avatar
                src={viewTeacher.photo_url}
                name={formatFullName(viewTeacher.first_name, viewTeacher.middle_name, viewTeacher.surname)}
                size="xl"
              />
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {formatFullName(viewTeacher.first_name, viewTeacher.middle_name, viewTeacher.surname)}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {viewTeacher.teacher_code} · GHA: {viewTeacher.gha_number || '—'} · {viewTeacher.employment_status}
                </p>
                <p className="text-sm text-emerald-900 font-medium mt-1">{viewTeacher.current_rank}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="border border-slate-200 rounded-lg p-3.5 space-y-1.5">
                <p className="text-xs font-semibold text-slate-500">Contact &amp; Qualification</p>
                <p>Phone: {viewTeacher.phone || '—'}</p>
                <p>Email: {viewTeacher.email || '—'}</p>
                <p>Address: {viewTeacher.address || '—'}</p>
                <p>Qualification: {viewTeacher.academic_qualification || '—'}</p>
              </div>
              <div className="border border-slate-200 rounded-lg p-3.5 space-y-1.5">
                <p className="text-xs font-semibold text-slate-500">Service Dates &amp; Assignments</p>
                <p>First Appointment: {viewTeacher.first_appointment_date || '—'}</p>
                <p>Date Promoted: {viewTeacher.date_promoted || '—'}</p>
                <p>
                  Classes:{' '}
                  {viewTeacher.assigned_classes?.length
                    ? viewTeacher.assigned_classes.map((c) => c.name).join(', ')
                    : 'None'}
                </p>
                <p>
                  Subjects:{' '}
                  {viewTeacher.assigned_subjects?.length
                    ? viewTeacher.assigned_subjects.map((s) => s.name).join(', ')
                    : 'None'}
                </p>
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
        title="Delete Teacher Record"
        message={
          deleteTarget
            ? `Are you sure you want to delete ${formatFullName(
                deleteTarget.first_name,
                deleteTarget.middle_name,
                deleteTarget.surname
              )} (${deleteTarget.teacher_code})?`
            : ''
        }
      />
    </div>
  );
}
