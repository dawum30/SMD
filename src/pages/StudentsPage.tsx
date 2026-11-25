import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { Avatar } from '../components/ui/Avatar';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import {
  AcademicYear,
  ResultRecord,
  SchoolClass,
  Student,
  StudentEnrollment,
  StudentStatus,
} from '../types/database';
import { downloadCSV, formatFullName, formatOrdinal } from '../utils/grading';

const PAGE_SIZE = 10;

const emptyForm = {
  first_name: '',
  middle_name: '',
  surname: '',
  gender: 'Female' as 'Male' | 'Female',
  date_of_birth: '2017-01-01',
  admission_date: new Date().toISOString().slice(0, 10),
  current_class_id: '',
  guardian_name: '',
  guardian_phone: '',
  guardian_address: '',
  guardian_relationship: 'Parent',
  photo_url: '',
  status: 'Active' as StudentStatus,
};

export function StudentsPage() {
  const { isAdmin, activeSchool } = useAuth();
  const { notify } = useToast();

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Add/Edit Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete Confirmation
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Profile Modal
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState<{
    student: Student;
    enrollments: StudentEnrollment[];
    results: (ResultRecord & { academic_year_name: string })[];
    overallAverage: number;
    classPosition: number;
    classSize: number;
  } | null>(null);

  // Bulk Promotion Modal
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteClassId, setPromoteClassId] = useState('');
  const [promoteYearId, setPromoteYearId] = useState('');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [st, cl, ay] = await Promise.all([
        api.getStudents(),
        api.getClasses(),
        api.getAcademicYearsAndTerms(),
      ]);
      setStudents(st);
      setClasses(cl);
      setAcademicYears(ay.academicYears);
      if (!form.current_class_id && cl.length > 0) {
        const b3 = cl.find((c) => c.name.includes('Basic 3')) || cl[0];
        setForm((f) => ({ ...f, current_class_id: b3.id }));
      }
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to load students.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSchool) loadAll();
  }, [activeSchool]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (genderFilter && s.gender !== genderFilter) return false;
      if (classFilter && s.current_class_id !== classFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (!q) return true;
      const full = formatFullName(s.first_name, s.middle_name, s.surname).toLowerCase();
      return (
        full.includes(q) ||
        s.student_code.toLowerCase().includes(q) ||
        (s.guardian_name || '').toLowerCase().includes(q) ||
        (s.guardian_phone || '').toLowerCase().includes(q)
      );
    });
  }, [students, search, genderFilter, classFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, genderFilter, classFilter, statusFilter]);

  const openCreate = () => {
    const defaultClass = classes.find((c) => c.name.includes('Basic 3'))?.id || classes[0]?.id || '';
    setEditingId(null);
    setForm({ ...emptyForm, current_class_id: defaultClass });
    setFormOpen(true);
  };

  const openEdit = (st: Student) => {
    setEditingId(st.id);
    setForm({
      first_name: st.first_name,
      middle_name: st.middle_name || '',
      surname: st.surname,
      gender: st.gender,
      date_of_birth: st.date_of_birth,
      admission_date: st.admission_date,
      current_class_id: st.current_class_id || '',
      guardian_name: st.guardian_name || '',
      guardian_phone: st.guardian_phone || '',
      guardian_address: st.guardian_address || '',
      guardian_relationship: st.guardian_relationship || 'Parent',
      photo_url: st.photo_url || '',
      status: st.status,
    });
    setFormOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const url = await api.uploadImage(file, 'student-photos');
      setForm((f) => ({ ...f, photo_url: url }));
      notify('success', 'Student photograph uploaded.');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.updateStudent(editingId, form);
        notify('success', 'Student record updated.');
      } else {
        await api.createStudent(form);
        notify('success', 'New student registered.');
      }
      setFormOpen(false);
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to save student.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteStudent(deleteTarget.id);
      notify('success', 'Student record deleted.');
      setDeleteTarget(null);
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to delete student.');
    } finally {
      setDeleting(false);
    }
  };

  const openProfile = async (id: string) => {
    setProfileOpen(true);
    setProfileLoading(true);
    setProfileData(null);
    try {
      const data = await api.getStudentProfile(id);
      setProfileData(data);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to load student profile.');
      setProfileOpen(false);
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePromoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoteClassId || !promoteYearId || selectedIds.length === 0) return;
    try {
      await api.promoteStudents(selectedIds, promoteClassId, promoteYearId);
      notify('success', `Promoted ${selectedIds.length} student(s) successfully.`);
      setSelectedIds([]);
      setPromoteOpen(false);
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Promotion failed.');
    }
  };

  const handleExportCSV = () => {
    downloadCSV(
      `students-${activeSchool?.code || 'export'}.csv`,
      ['Student ID', 'First Name', 'Middle Name', 'Surname', 'Gender', 'DOB', 'Class', 'Status', 'Guardian', 'Guardian Phone'],
      filtered.map((s) => [
        s.student_code,
        s.first_name,
        s.middle_name,
        s.surname,
        s.gender,
        s.date_of_birth,
        s.class_name || '',
        s.status,
        s.guardian_name || '',
        s.guardian_phone || '',
      ])
    );
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">Students Registry</h2>
          <p className="text-sm text-slate-500 mt-1">
            {filtered.length} student record{filtered.length === 1 ? '' : 's'} across Basic 1–9
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setPromoteClassId(classes[0]?.id || '');
                setPromoteYearId(academicYears.find((y) => y.is_current)?.id || academicYears[0]?.id || '');
                setPromoteOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 whitespace-nowrap"
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>Promote ({selectedIds.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCSV}
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
            <span>Print List</span>
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-950 rounded-lg hover:bg-emerald-900 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 no-print">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, ID, guardian..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800"
          />
        </div>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
        >
          <option value="">All Classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Graduated">Graduated</option>
          <option value="Transferred">Transferred</option>
          <option value="Suspended">Suspended</option>
          <option value="Withdrawn">Withdrawn</option>
        </select>
      </div>

      {/* Print Header */}
      <div className="hidden print-only mb-4">
        <h2 className="text-xl font-bold">{activeSchool?.name} — Student Register</h2>
        <p className="text-xs text-slate-600">Total Listed: {filtered.length}</p>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                {isAdmin && (
                  <th className="py-3 px-4 w-10 no-print">
                    <input
                      type="checkbox"
                      aria-label="Select all visible students"
                      checked={paginated.length > 0 && paginated.every((s) => selectedIds.includes(s.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds((prev) => Array.from(new Set([...prev, ...paginated.map((s) => s.id)])));
                        } else {
                          setSelectedIds((prev) => prev.filter((id) => !paginated.some((s) => s.id === id)));
                        }
                      }}
                    />
                  </th>
                )}
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Student ID</th>
                <th className="py-3 px-4">Class</th>
                <th className="py-3 px-4">Gender</th>
                <th className="py-3 px-4">Guardian</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right no-print">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx}>
                    <td colSpan={8} className="py-4 px-4">
                      <div className="h-5 bg-slate-100 animate-pulse rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center text-slate-500">
                    No students match your current search or filter criteria.
                  </td>
                </tr>
              ) : (
                paginated.map((st) => {
                  const fullName = formatFullName(st.first_name, st.middle_name, st.surname);
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/70 transition-colors">
                      {isAdmin && (
                        <td className="py-3 px-4 no-print">
                          <input
                            type="checkbox"
                            aria-label={`Select ${fullName}`}
                            checked={selectedIds.includes(st.id)}
                            onChange={() => toggleSelect(st.id)}
                          />
                        </td>
                      )}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar src={st.photo_url} name={fullName} size="sm" />
                          <div>
                            <button
                              type="button"
                              onClick={() => openProfile(st.id)}
                              className="font-medium text-slate-900 hover:text-emerald-900 text-left"
                            >
                              {fullName}
                            </button>
                            <p className="text-xs text-slate-500 font-mono tabular-nums">DOB: {st.date_of_birth}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        {st.student_code}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">{st.class_name || 'Unassigned'}</td>
                      <td className="py-3 px-4 text-slate-700">{st.gender}</td>
                      <td className="py-3 px-4">
                        <p className="text-slate-900 text-sm">{st.guardian_name || '—'}</p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums">{st.guardian_phone || ''}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs font-medium ${
                            st.status === 'Active'
                              ? 'text-emerald-800'
                              : st.status === 'Suspended' || st.status === 'Withdrawn'
                              ? 'text-red-700'
                              : 'text-slate-600'
                          }`}
                        >
                          {st.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap no-print">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openProfile(st.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-900 hover:bg-slate-100"
                            title="View student profile"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(st)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                            title="Edit student"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(st)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50"
                              title="Delete student"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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

        {/* Pagination Footer */}
        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 no-print">
          <span>
            Showing {filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 font-mono tabular-nums">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Student Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Student Record' : 'Register New Student'}
        subtitle="Student ID is automatically generated upon registration."
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
              <p className="text-xs text-slate-500 mt-1">PNG or JPEG, max 5 MB.</p>
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

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Date of Birth *</label>
              <input
                type="date"
                required
                value={form.date_of_birth}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Admission Date *</label>
              <input
                type="date"
                required
                value={form.admission_date}
                onChange={(e) => setForm({ ...form, admission_date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Class *</label>
              <select
                required
                value={form.current_class_id}
                onChange={(e) => setForm({ ...form, current_class_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Select Class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <h4 className="text-sm font-semibold text-slate-900 mb-3">Guardian Details</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Guardian Full Name *</label>
                <input
                  type="text"
                  required
                  value={form.guardian_name}
                  onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Guardian Phone *</label>
                <input
                  type="tel"
                  required
                  value={form.guardian_phone}
                  onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })}
                  placeholder="+233 24 000 0000"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Guardian Address</label>
                <input
                  type="text"
                  value={form.guardian_address}
                  onChange={(e) => setForm({ ...form, guardian_address: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Student Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as StudentStatus })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Active">Active</option>
                  <option value="Graduated">Graduated</option>
                  <option value="Transferred">Transferred</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Withdrawn">Withdrawn</option>
                </select>
              </div>
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
              className="px-4 py-2 text-sm font-semibold bg-emerald-950 text-white rounded-lg hover:bg-emerald-900 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Update Student' : 'Register Student'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Student Profile Modal */}
      <Modal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Student Academic Profile"
        maxWidth="4xl"
      >
        {profileLoading || !profileData ? (
          <div className="py-12 text-center text-sm text-slate-500">Loading academic history...</div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
              <div className="flex items-center gap-4">
                <Avatar
                  src={profileData.student.photo_url}
                  name={formatFullName(
                    profileData.student.first_name,
                    profileData.student.middle_name,
                    profileData.student.surname
                  )}
                  size="xl"
                />
                <div>
                  <h3 className="text-xl font-bold text-slate-900 font-display">
                    {formatFullName(
                      profileData.student.first_name,
                      profileData.student.middle_name,
                      profileData.student.surname
                    )}
                  </h3>
                  <p className="text-sm text-slate-500 font-mono tabular-nums mt-0.5">
                    {profileData.student.student_code} · {profileData.student.class_name} · {profileData.student.gender}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    DOB: {profileData.student.date_of_birth} · Admitted: {profileData.student.admission_date} · Status:{' '}
                    {profileData.student.status}
                  </p>
                </div>
              </div>

              <div className="flex gap-6 text-right">
                <div>
                  <p className="text-xs text-slate-500">Current Average</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-emerald-900">
                    {profileData.overallAverage.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Class Position</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {profileData.classPosition > 0
                      ? `${formatOrdinal(profileData.classPosition)} / ${profileData.classSize}`
                      : '—'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Guardian Information</h4>
                <div className="text-sm space-y-1 text-slate-600 border border-slate-200 rounded-lg p-3.5">
                  <p>
                    <span className="font-medium text-slate-800">Name:</span> {profileData.student.guardian_name || '—'}
                  </p>
                  <p>
                    <span className="font-medium text-slate-800">Phone:</span>{' '}
                    <span className="font-mono">{profileData.student.guardian_phone || '—'}</span>
                  </p>
                  <p>
                    <span className="font-medium text-slate-800">Address:</span>{' '}
                    {profileData.student.guardian_address || '—'}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Class &amp; Promotion History</h4>
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-sm">
                  {profileData.enrollments.length === 0 ? (
                    <p className="p-3 text-slate-400">No historical enrollments recorded.</p>
                  ) : (
                    profileData.enrollments.map((en) => (
                      <div key={en.id} className="px-3.5 py-2 flex items-center justify-between">
                        <div>
                          <span className="font-medium text-slate-900">{en.class_name}</span>
                          <span className="text-slate-400 mx-1.5">·</span>
                          <span className="text-slate-600">{en.academic_year_name}</span>
                        </div>
                        <span className="text-xs font-medium text-slate-600">{en.promotion_status}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-2">Academic &amp; Termly Subject Results</h4>
              <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3">Year / Term</th>
                      <th className="py-2.5 px-3">Class</th>
                      <th className="py-2.5 px-3">Subject</th>
                      <th className="py-2.5 px-3 text-right">Ex.</th>
                      <th className="py-2.5 px-3 text-right">HW</th>
                      <th className="py-2.5 px-3 text-right">Proj.</th>
                      <th className="py-2.5 px-3 text-right">Exam</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      <th className="py-2.5 px-3 text-center">Grade</th>
                      <th className="py-2.5 px-3">Remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                    {profileData.results.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-6 text-center font-sans text-slate-400">
                          No academic results recorded yet.
                        </td>
                      </tr>
                    ) : (
                      profileData.results.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2 px-3 font-sans text-slate-700">
                            {r.academic_year_name} · {r.term_name}
                          </td>
                          <td className="py-2 px-3 font-sans text-slate-600">{r.class_name}</td>
                          <td className="py-2 px-3 font-sans font-medium text-slate-900">{r.subject_name}</td>
                          <td className="py-2 px-3 text-right">{r.class_exercise}</td>
                          <td className="py-2 px-3 text-right">{r.homework}</td>
                          <td className="py-2 px-3 text-right">{r.project}</td>
                          <td className="py-2 px-3 text-right">{r.exam}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">{r.total_score}</td>
                          <td className="py-2 px-3 text-center font-bold">{r.grade}</td>
                          <td className="py-2 px-3 font-sans text-slate-600">{r.remarks}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk Promote Modal */}
      <Modal
        open={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        title="Promote Selected Students"
        subtitle="Previous class enrollments will remain permanently preserved in academic history."
        maxWidth="md"
      >
        <form onSubmit={handlePromoteSubmit} className="space-y-4">
          <p className="text-sm text-slate-600">
            Promoting <strong>{selectedIds.length}</strong> selected student(s).
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Target Academic Year</label>
            <select
              required
              value={promoteYearId}
              onChange={(e) => setPromoteYearId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Target Class</label>
            <select
              required
              value={promoteClassId}
              onChange={(e) => setPromoteClassId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPromoteOpen(false)}
              className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-semibold bg-emerald-950 text-white rounded-lg hover:bg-emerald-900"
            >
              Confirm Promotion
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Student Record"
        message={
          deleteTarget
            ? `Are you sure you want to permanently remove ${formatFullName(
                deleteTarget.first_name,
                deleteTarget.middle_name,
                deleteTarget.surname
              )} (${deleteTarget.student_code}) and their associated results?`
            : ''
        }
      />
    </div>
  );
}
