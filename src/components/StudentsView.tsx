import React, { useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, setDoc } from 'firebase/firestore';
import {
  Edit3,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { getFirebaseInstances } from '../lib/firebase';
import {
  buildPendingChangePayload,
  validateAndBuildStudentPayload,
} from '../lib/firestoreValidation';
import { getClassLabel, t } from '../lib/i18n';
import {
  compareRollNumbers,
  compressImageToBase64,
  formatPhotoSrc,
  matchesClassScope,
} from '../lib/schoolUtils';
import { CLASS_LEVELS, type StudentDoc } from '../types/school';

interface StudentFormState {
  id?: string;
  createdAt?: unknown;
  studentNameBn: string;
  studentNameEn: string;
  fatherNameEn: string;
  motherNameEn: string;
  dateOfBirth: string;
  guardianPhone: string;
  address: string;
  photoBase64: string;
  rollNumber: string;
  nextYearRollNumber: string;
  classLevel: string;
  section: string;
  academicYear: number;
  totalSchoolDays: string;
  daysPresent: string;
  promotionStatus: string;
  sectorNotes: string;
  customValues: Record<string, string | number | boolean>;
  subjectValues: Record<string, string | number | boolean>;
  examResults: Record<string, number | string>;
}

export const StudentsView: React.FC = () => {
  const {
    lang,
    session,
    students,
    subjects,
    customFields,
    selectedAcademicYear,
    selectedClass,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'roll' | 'name'>('roll');
  const [showAllClasses, setShowAllClasses] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState<StudentDoc | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const isAdmin = session?.role === 'ADMIN';

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = students.filter((s) => {
      if (Number(s.academicYear) !== Number(selectedAcademicYear)) return false;
      if (!showAllClasses && s.classLevel !== selectedClass) return false;
      if (!q) return true;
      return (
        (s.studentNameBn || '').toLowerCase().includes(q) ||
        (s.studentNameEn || '').toLowerCase().includes(q) ||
        String(s.rollNumber || '').toLowerCase().includes(q) ||
        (s.guardianPhone || '').toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'name') {
        const na = a.studentNameEn || a.studentNameBn || '';
        const nb = b.studentNameEn || b.studentNameBn || '';
        return na.localeCompare(nb);
      }
      return compareRollNumbers(a, b);
    });
  }, [students, selectedAcademicYear, selectedClass, showAllClasses, searchQuery, sortBy]);

  const openCreateModal = () => {
    setPhotoError(null);
    setEditingStudent({
      studentNameBn: '',
      studentNameEn: '',
      fatherNameEn: '',
      motherNameEn: '',
      dateOfBirth: '',
      guardianPhone: '',
      address: '',
      photoBase64: '',
      rollNumber: String(filteredStudents.length + 1),
      nextYearRollNumber: '',
      classLevel: selectedClass,
      section: '',
      academicYear: selectedAcademicYear,
      totalSchoolDays: '0',
      daysPresent: '0',
      promotionStatus: '',
      sectorNotes: '',
      customValues: {},
      subjectValues: {},
      examResults: {},
    });
  };

  const openEditModal = (st: StudentDoc) => {
    setPhotoError(null);
    setEditingStudent({
      id: st.id,
      createdAt: st.createdAt,
      studentNameBn: st.studentNameBn || '',
      studentNameEn: st.studentNameEn || '',
      fatherNameEn: st.fatherNameEn || '',
      motherNameEn: st.motherNameEn || '',
      dateOfBirth: st.dateOfBirth || '',
      guardianPhone: st.guardianPhone || '',
      address: st.address || '',
      photoBase64: st.photoBase64 || '',
      rollNumber: String(st.rollNumber ?? ''),
      nextYearRollNumber: String(st.nextYearRollNumber ?? ''),
      classLevel: st.classLevel || selectedClass,
      section: st.section || '',
      academicYear: Number(st.academicYear) || selectedAcademicYear,
      totalSchoolDays: String(st.totalSchoolDays ?? 0),
      daysPresent: String(st.daysPresent ?? 0),
      promotionStatus: st.promotionStatus || '',
      sectorNotes: st.sectorNotes || '',
      customValues: { ...(st.customValues || {}) },
      subjectValues: { ...(st.subjectValues || {}) },
      examResults: { ...(st.examResults || {}) },
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingStudent) return;
    setPhotoError(null);
    try {
      const compressed = await compressImageToBase64(file, 98000);
      setEditingStudent((prev) => (prev ? { ...prev, photoBase64: compressed } : null));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Photo compression failed');
    }
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent || !session) return;
    const instances = getFirebaseInstances();
    if (!instances) return;

    setSaving(true);
    setStatusBanner(null);

    try {
      const studentInput: Partial<StudentDoc> = {
        studentNameBn: editingStudent.studentNameBn,
        studentNameEn: editingStudent.studentNameEn,
        fatherNameEn: editingStudent.fatherNameEn,
        motherNameEn: editingStudent.motherNameEn,
        dateOfBirth: editingStudent.dateOfBirth,
        guardianPhone: editingStudent.guardianPhone,
        address: editingStudent.address,
        photoBase64: editingStudent.photoBase64,
        rollNumber: editingStudent.rollNumber,
        nextYearRollNumber: editingStudent.nextYearRollNumber,
        classLevel: editingStudent.classLevel,
        section: editingStudent.section,
        academicYear: editingStudent.academicYear,
        totalSchoolDays: Number(editingStudent.totalSchoolDays) || 0,
        daysPresent: Number(editingStudent.daysPresent) || 0,
        promotionStatus: editingStudent.promotionStatus,
        sectorNotes: editingStudent.sectorNotes,
        customValues: editingStudent.customValues,
        subjectValues: editingStudent.subjectValues,
        examResults: editingStudent.examResults,
      };

      if (isAdmin) {
        const payload = validateAndBuildStudentPayload(
          studentInput,
          session.schoolId,
          session.name,
          editingStudent.createdAt
        );
        const targetRef = editingStudent.id
          ? doc(instances.db, 'schools', session.schoolId, 'students', editingStudent.id)
          : doc(collection(instances.db, 'schools', session.schoolId, 'students'));

        await setDoc(targetRef, payload, { merge: true });
        setStatusBanner({ type: 'success', text: t(lang, 'savedSuccess') });
      } else {
        // Validate limits before queueing pending change
        validateAndBuildStudentPayload(
          studentInput,
          session.schoolId,
          session.name,
          editingStudent.createdAt
        );

        const isCreate = !editingStudent.id;
        const targetId = editingStudent.id || `new_${Date.now()}`;
        const displayName =
          editingStudent.studentNameBn || editingStudent.studentNameEn || 'Student';

        const pendingDoc = buildPendingChangePayload({
          schoolId: session.schoolId,
          entityType: isCreate ? 'STUDENT_CREATE' : 'STUDENT_UPDATE',
          targetId,
          submittedByDeviceId: session.deviceId,
          submittedByName: session.name,
          summary: `${isCreate ? 'New student' : 'Update student'}: ${displayName} (Roll ${editingStudent.rollNumber})`,
          detailsText: `Class ${editingStudent.classLevel} (${editingStudent.academicYear})`,
          payloadJson: JSON.stringify({
            ...studentInput,
            schoolId: session.schoolId,
            id: editingStudent.id || undefined,
          }),
          status: 'PENDING',
        });

        await addDoc(
          collection(instances.db, 'schools', session.schoolId, 'pendingChanges'),
          pendingDoc
        );
        setStatusBanner({ type: 'success', text: t(lang, 'submittedApprovalSuccess') });
      }

      setEditingStudent(null);
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: `${t(lang, 'errorPrefix')} ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!confirmDeleteStudent || !session || !isAdmin) return;
    const instances = getFirebaseInstances();
    if (!instances) return;

    try {
      await deleteDoc(
        doc(instances.db, 'schools', session.schoolId, 'students', confirmDeleteStudent.id)
      );
      setConfirmDeleteStudent(null);
      setStatusBanner({ type: 'success', text: t(lang, 'savedSuccess') });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: `${t(lang, 'errorPrefix')} ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const modalSubjects = useMemo(() => {
    if (!editingStudent) return [];
    return subjects.filter((s) => matchesClassScope(s.gradeScope, editingStudent.classLevel));
  }, [subjects, editingStudent?.classLevel]);

  return (
    <div className="space-y-5">
      {statusBanner && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-sm ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{statusBanner.text}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="p-1 hover:opacity-70 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t(lang, 'searchStudents')}
              className="w-full pl-9 pr-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg">
            <button
              type="button"
              onClick={() => setSortBy('roll')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                sortBy === 'roll'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t(lang, 'sortByRoll')}
            </button>
            <button
              type="button"
              onClick={() => setSortBy('name')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                sortBy === 'name'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t(lang, 'sortByName')}
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showAllClasses}
              onChange={(e) => setShowAllClasses(e.target.checked)}
              className="rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
            />
            <span>{t(lang, 'allClasses')}</span>
          </label>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{isAdmin ? t(lang, 'addStudent') : t(lang, 'proposeStudent')}</span>
        </button>
      </div>

      {/* Students Table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {filteredStudents.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-500">{t(lang, 'noStudentsFound')}</p>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isAdmin ? t(lang, 'addStudent') : t(lang, 'proposeStudent')}</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">{t(lang, 'rollNumber')}</th>
                  <th className="py-3 px-4">{lang === 'bn' ? 'শিক্ষার্থী' : 'Student'}</th>
                  {showAllClasses && <th className="py-3 px-4">{t(lang, 'classSelector')}</th>}
                  <th className="py-3 px-4">{t(lang, 'guardianPhone')}</th>
                  <th className="py-3 px-4 text-right">{t(lang, 'daysPresent')}</th>
                  <th className="py-3 px-4">{t(lang, 'promotionStatus')}</th>
                  <th className="py-3 px-4 text-right">{lang === 'bn' ? 'কার্যক্রম' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredStudents.map((st) => {
                  const photo = formatPhotoSrc(st.photoBase64);
                  return (
                    <tr key={st.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-2.5 px-4 font-mono tabular-nums font-semibold text-slate-900">
                        {st.rollNumber || '—'}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          {photo ? (
                            <img
                              src={photo}
                              alt={st.studentNameEn || st.studentNameBn}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-full object-cover border border-stone-200 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center text-xs font-semibold shrink-0">
                              {(st.studentNameEn || st.studentNameBn || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 truncate">
                              {st.studentNameBn || st.studentNameEn}
                            </div>
                            {st.studentNameBn && st.studentNameEn && (
                              <div className="text-xs text-slate-500 truncate">
                                {st.studentNameEn}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      {showAllClasses && (
                        <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">
                          {getClassLabel(st.classLevel, lang)}
                        </td>
                      )}
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600">
                        {st.guardianPhone || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {st.totalSchoolDays
                          ? `${st.daysPresent || 0} / ${st.totalSchoolDays}`
                          : st.daysPresent ?? '—'}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">
                        {st.promotionStatus || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(st)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-md hover:bg-stone-50 cursor-pointer whitespace-nowrap"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>{lang === 'bn' ? 'সম্পাদনা' : 'Edit'}</span>
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteStudent(st)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-md cursor-pointer"
                              title={t(lang, 'deleteStudent')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Student Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-stone-200 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingStudent.id ? t(lang, 'editStudent') : t(lang, 'addStudent')}
              </h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Photo Upload */}
              <div className="flex flex-wrap items-center gap-4 pb-5 border-b border-stone-200">
                {formatPhotoSrc(editingStudent.photoBase64) ? (
                  <img
                    src={formatPhotoSrc(editingStudent.photoBase64)!}
                    alt="Student preview"
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-xl object-cover border border-stone-200"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-slate-400 text-xs">
                    Photo
                  </div>
                )}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-stone-300 rounded-lg hover:bg-stone-50 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{t(lang, 'uploadPhoto')}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>
                    {editingStudent.photoBase64 && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingStudent((p) => (p ? { ...p, photoBase64: '' } : null))
                        }
                        className="px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 cursor-pointer"
                      >
                        {t(lang, 'removePhoto')}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{t(lang, 'photoHint')}</p>
                  {photoError && <p className="text-xs text-rose-600">{photoError}</p>}
                </div>
              </div>

              {/* Core Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t(lang, 'studentNameBn')} *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingStudent.studentNameBn}
                    onChange={(e) =>
                      setEditingStudent((p) => (p ? { ...p, studentNameBn: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t(lang, 'studentNameEn')} *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingStudent.studentNameEn}
                    onChange={(e) =>
                      setEditingStudent((p) => (p ? { ...p, studentNameEn: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t(lang, 'fatherNameEn')}
                  </label>
                  <input
                    type="text"
                    value={editingStudent.fatherNameEn}
                    onChange={(e) =>
                      setEditingStudent((p) => (p ? { ...p, fatherNameEn: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t(lang, 'motherNameEn')}
                  </label>
                  <input
                    type="text"
                    value={editingStudent.motherNameEn}
                    onChange={(e) =>
                      setEditingStudent((p) => (p ? { ...p, motherNameEn: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t(lang, 'dateOfBirth')}
                  </label>
                  <input
                    type="date"
                    value={editingStudent.dateOfBirth}
                    onChange={(e) =>
                      setEditingStudent((p) => (p ? { ...p, dateOfBirth: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t(lang, 'guardianPhone')}
                  </label>
                  <input
                    type="tel"
                    value={editingStudent.guardianPhone}
                    onChange={(e) =>
                      setEditingStudent((p) => (p ? { ...p, guardianPhone: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t(lang, 'address')}
                  </label>
                  <input
                    type="text"
                    value={editingStudent.address}
                    onChange={(e) =>
                      setEditingStudent((p) => (p ? { ...p, address: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              {/* Academic & Yearly Fields */}
              <div className="pt-4 border-t border-stone-200 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t(lang, 'classSelector')}
                  </label>
                  <select
                    value={editingStudent.classLevel}
                    onChange={(e) =>
                      setEditingStudent((p) => (p ? { ...p, classLevel: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg bg-white"
                  >
                    {CLASS_LEVELS.map((cls) => (
                      <option key={cls} value={cls}>
                        {getClassLabel(cls, lang)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t(lang, 'academicYear')}
                  </label>
                  <input
                    type="number"
                    value={editingStudent.academicYear}
                    onChange={(e) =>
                      setEditingStudent((p) =>
                        p ? { ...p, academicYear: Number(e.target.value) } : null
                      )
                    }
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t(lang, 'rollNumber')}
                  </label>
                  <input
                    type="text"
                    value={editingStudent.rollNumber}
                    onChange={(e) =>
                      setEditingStudent((p) => (p ? { ...p, rollNumber: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t(lang, 'section')}
                  </label>
                  <input
                    type="text"
                    value={editingStudent.section}
                    onChange={(e) =>
                      setEditingStudent((p) => (p ? { ...p, section: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t(lang, 'nextYearRollNumber')}
                  </label>
                  <input
                    type="text"
                    value={editingStudent.nextYearRollNumber}
                    onChange={(e) =>
                      setEditingStudent((p) =>
                        p ? { ...p, nextYearRollNumber: e.target.value } : null
                      )
                    }
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t(lang, 'totalSchoolDays')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editingStudent.totalSchoolDays}
                    onChange={(e) =>
                      setEditingStudent((p) =>
                        p ? { ...p, totalSchoolDays: e.target.value } : null
                      )
                    }
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t(lang, 'daysPresent')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editingStudent.daysPresent}
                    onChange={(e) =>
                      setEditingStudent((p) => (p ? { ...p, daysPresent: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t(lang, 'promotionStatus')}
                  </label>
                  <input
                    type="text"
                    value={editingStudent.promotionStatus}
                    onChange={(e) =>
                      setEditingStudent((p) =>
                        p ? { ...p, promotionStatus: e.target.value } : null
                      )
                    }
                    placeholder="Promoted / Retained"
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Custom Fields */}
              {customFields.length > 0 && (
                <div className="pt-4 border-t border-stone-200 space-y-3">
                  <h4 className="text-sm font-semibold text-slate-900">
                    {t(lang, 'customFieldsSection')}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {customFields.map((cf) => {
                      const val = editingStudent.customValues[cf.id] ?? '';
                      return (
                        <div key={cf.id}>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            {cf.label} ({cf.category})
                          </label>
                          {cf.fieldType === 'YES_NO' ? (
                            <select
                              value={String(val)}
                              onChange={(e) =>
                                setEditingStudent((p) =>
                                  p
                                    ? {
                                        ...p,
                                        customValues: {
                                          ...p.customValues,
                                          [cf.id]: e.target.value,
                                        },
                                      }
                                    : null
                                )
                              }
                              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg bg-white"
                            >
                              <option value="">—</option>
                              <option value="Yes">Yes / হ্যাঁ</option>
                              <option value="No">No / না</option>
                            </select>
                          ) : (
                            <input
                              type={cf.fieldType === 'NUMBER' ? 'number' : 'text'}
                              value={String(val)}
                              onChange={(e) =>
                                setEditingStudent((p) =>
                                  p
                                    ? {
                                        ...p,
                                        customValues: {
                                          ...p.customValues,
                                          [cf.id]:
                                            cf.fieldType === 'NUMBER' && e.target.value !== ''
                                              ? Number(e.target.value)
                                              : e.target.value,
                                        },
                                      }
                                    : null
                                )
                              }
                              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Subject Assessment Fields */}
              {modalSubjects.some((s) => s.fields?.length > 0) && (
                <div className="pt-4 border-t border-stone-200 space-y-3">
                  <h4 className="text-sm font-semibold text-slate-900">
                    {t(lang, 'subjectFieldsSection')}
                  </h4>
                  <div className="space-y-4">
                    {modalSubjects
                      .filter((s) => s.fields?.length > 0)
                      .map((subj) => (
                        <div key={subj.id} className="bg-stone-50 border border-stone-200 rounded-lg p-3.5 space-y-2.5">
                          <div className="text-xs font-semibold text-slate-800">{subj.name}</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {subj.fields.map((fld) => {
                              const key = `${subj.id}__${fld.fieldId}`;
                              const val = editingStudent.subjectValues[key] ?? '';
                              return (
                                <div key={key}>
                                  <label className="block text-xs text-slate-600 mb-1">
                                    {fld.label}
                                    {fld.maxMarks ? ` (Max ${fld.maxMarks})` : ''}
                                  </label>
                                  <input
                                    type={fld.fieldType === 'NUMBER' ? 'number' : 'text'}
                                    value={String(val)}
                                    onChange={(e) =>
                                      setEditingStudent((p) =>
                                        p
                                          ? {
                                              ...p,
                                              subjectValues: {
                                                ...p.subjectValues,
                                                [key]:
                                                  fld.fieldType === 'NUMBER' && e.target.value !== ''
                                                    ? Number(e.target.value)
                                                    : e.target.value,
                                              },
                                            }
                                          : null
                                      )
                                    }
                                    className="w-full px-2.5 py-1.5 text-sm bg-white border border-stone-300 rounded-md"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Sector Notes */}
              <div className="pt-4 border-t border-stone-200">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t(lang, 'sectorNotes')}
                </label>
                <textarea
                  rows={3}
                  value={editingStudent.sectorNotes}
                  onChange={(e) =>
                    setEditingStudent((p) => (p ? { ...p, sectorNotes: e.target.value } : null))
                  }
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 cursor-pointer"
                >
                  {t(lang, 'cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {saving
                    ? t(lang, 'loading')
                    : isAdmin
                    ? t(lang, 'saveChanges')
                    : t(lang, 'submitForApproval')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Student Confirmation Modal (Admin only) */}
      {confirmDeleteStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">
              {t(lang, 'deleteStudent')}
            </h3>
            <p className="text-sm text-slate-600">
              {lang === 'bn'
                ? `আপনি কি নিশ্চিতভাবে "${confirmDeleteStudent.studentNameBn || confirmDeleteStudent.studentNameEn}" (রোল ${confirmDeleteStudent.rollNumber})-কে মুছে ফেলতে চান?`
                : `Are you sure you want to delete "${confirmDeleteStudent.studentNameBn || confirmDeleteStudent.studentNameEn}" (Roll ${confirmDeleteStudent.rollNumber})?`}
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteStudent(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 cursor-pointer"
              >
                {t(lang, 'cancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteStudent}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
              >
                {t(lang, 'deleteStudent')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
