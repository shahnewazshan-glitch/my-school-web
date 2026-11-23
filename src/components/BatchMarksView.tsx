import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Save, Send, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { getFirebaseInstances } from '../lib/firebase';
import {
  buildPendingChangePayload,
  FIRESTORE_LIMITS,
  sanitizeRecordMap,
} from '../lib/firestoreValidation';
import { t } from '../lib/i18n';
import {
  calculateSubjectGrade,
  getClassSubjectsForMarksheet,
  getTermSubjectScore,
  matchesClassScope,
  normalizeExamConfigs,
  TERM_ORDER,
} from '../lib/schoolUtils';
import type { ExamTermId } from '../types/school';

export const BatchMarksView: React.FC = () => {
  const {
    lang,
    session,
    school,
    students,
    selectedAcademicYear,
    selectedClass,
  } = useApp();

  const isAdmin = session?.role === 'ADMIN';
  const examConfigs = useMemo(
    () => normalizeExamConfigs(school?.examConfigs),
    [school?.examConfigs]
  );

  const [selectedTerm, setSelectedTerm] = useState<ExamTermId>('exam_1');

  const classSubjects = useMemo(() => {
    const activeTermConfig = examConfigs.find((c) => c.examId === selectedTerm);
    const termSubjects = (activeTermConfig?.subjects || []).filter((s) =>
      matchesClassScope(s.classScope, selectedClass)
    );
    if (termSubjects.length > 0) return termSubjects;
    return getClassSubjectsForMarksheet(examConfigs, selectedClass);
  }, [examConfigs, selectedTerm, selectedClass]);

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  useEffect(() => {
    if (classSubjects.length > 0) {
      if (!classSubjects.some((s) => s.subjectId === selectedSubjectId)) {
        setSelectedSubjectId(classSubjects[0].subjectId);
      }
    } else {
      setSelectedSubjectId('');
    }
  }, [classSubjects, selectedSubjectId]);

  const activeSubject = useMemo(
    () => classSubjects.find((s) => s.subjectId === selectedSubjectId) || null,
    [classSubjects, selectedSubjectId]
  );

  const classStudents = useMemo(
    () =>
      students.filter(
        (s) =>
          Number(s.academicYear) === Number(selectedAcademicYear) &&
          s.classLevel === selectedClass
      ),
    [students, selectedAcademicYear, selectedClass]
  );

  // Local draft map: studentId -> { cont: string, sum: string }
  const [drafts, setDrafts] = useState<Record<string, { cont: string; sum: string }>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Sync drafts from live Firestore students when term/subject/class changes
  useEffect(() => {
    if (!selectedSubjectId) {
      setDrafts({});
      setDirtyIds(new Set());
      return;
    }
    const nextDrafts: Record<string, { cont: string; sum: string }> = {};
    for (const st of classStudents) {
      const score = getTermSubjectScore(st.examResults, selectedTerm, selectedSubjectId);
      nextDrafts[st.id] = {
        cont: score.cont !== null ? String(score.cont) : '',
        sum: score.sum !== null ? String(score.sum) : '',
      };
    }
    setDrafts(nextDrafts);
    setDirtyIds(new Set());
  }, [classStudents, selectedTerm, selectedSubjectId]);

  const handleCellChange = (studentId: string, field: 'cont' | 'sum', value: string) => {
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;
    setDrafts((prev) => ({
      ...prev,
      [studentId]: {
        cont: field === 'cont' ? value : prev[studentId]?.cont ?? '',
        sum: field === 'sum' ? value : prev[studentId]?.sum ?? '',
      },
    }));
    setDirtyIds((prev) => {
      const next = new Set(prev);
      next.add(studentId);
      return next;
    });
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    col: 'cont' | 'sum'
  ) => {
    const moveFocus = (nextRow: number, nextCol: 'cont' | 'sum') => {
      if (nextRow < 0 || nextRow >= classStudents.length) return;
      const targetStudent = classStudents[nextRow];
      const el = inputRefs.current[`${targetStudent.id}_${nextCol}`];
      if (el) {
        el.focus();
        el.select();
      }
    };

    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(rowIdx + 1, col);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(rowIdx - 1, col);
    } else if (e.key === 'ArrowRight' && col === 'cont') {
      e.preventDefault();
      moveFocus(rowIdx, 'sum');
    } else if (e.key === 'ArrowLeft' && col === 'sum') {
      e.preventDefault();
      moveFocus(rowIdx, 'cont');
    }
  };

  const computeRowStats = (studentId: string, examResults?: Record<string, number | string>) => {
    const d = drafts[studentId] || { cont: '', sum: '' };
    const contNum = d.cont !== '' ? Number(d.cont) : null;
    const sumNum = d.sum !== '' ? Number(d.sum) : null;
    const hasCurrent = contNum !== null || sumNum !== null;
    const currentTotal = hasCurrent ? (contNum ?? 0) + (sumNum ?? 0) : null;

    // 3-Term Average using live draft for selectedTerm and stored examResults for other 2 terms
    let termSum = 0;
    let termCount = 0;
    for (const termId of TERM_ORDER) {
      if (termId === selectedTerm) {
        if (currentTotal !== null) {
          termSum += currentTotal;
          termCount += 1;
        }
      } else if (selectedSubjectId) {
        const s = getTermSubjectScore(examResults, termId, selectedSubjectId);
        if (s.hasScore && s.total !== null) {
          termSum += s.total;
          termCount += 1;
        }
      }
    }
    const avg3Term = termCount > 0 ? Number((termSum / termCount).toFixed(1)) : null;

    const fullMarks = activeSubject?.fullMarks || 100;
    const grade =
      currentTotal !== null ? calculateSubjectGrade(currentTotal, fullMarks) : null;

    return { contNum, sumNum, currentTotal, avg3Term, grade, fullMarks };
  };

  const handleSaveAll = async () => {
    if (!session || !selectedSubjectId || dirtyIds.size === 0) return;
    const instances = getFirebaseInstances();
    if (!instances) return;

    setSaving(true);
    setBanner(null);

    try {
      const updates: Array<{
        studentId: string;
        studentName: string;
        examResults: Record<string, number | string>;
        patchKeys: Record<string, number | string | null>;
      }> = [];

      for (const st of classStudents) {
        if (!dirtyIds.has(st.id)) continue;
        const d = drafts[st.id] || { cont: '', sum: '' };
        const contKey = `${selectedTerm}__${selectedSubjectId}__cont`;
        const sumKey = `${selectedTerm}__${selectedSubjectId}__sum`;
        const totalKey = `${selectedTerm}__${selectedSubjectId}`;

        const nextResults: Record<string, number | string> = { ...(st.examResults || {}) };

        const contVal = d.cont !== '' ? Number(d.cont) : null;
        const sumVal = d.sum !== '' ? Number(d.sum) : null;

        if (contVal !== null) {
          nextResults[contKey] = contVal;
        } else {
          delete nextResults[contKey];
        }

        if (sumVal !== null) {
          nextResults[sumKey] = sumVal;
        } else {
          delete nextResults[sumKey];
        }

        if (contVal !== null || sumVal !== null) {
          nextResults[totalKey] = (contVal ?? 0) + (sumVal ?? 0);
        } else {
          delete nextResults[totalKey];
        }

        const sanitized = sanitizeRecordMap(nextResults);
        if (Object.keys(sanitized).length > FIRESTORE_LIMITS.EXAM_RESULTS_MAX_KEYS) {
          throw new Error(
            `${st.studentNameEn || st.studentNameBn}: examResults exceeds ${FIRESTORE_LIMITS.EXAM_RESULTS_MAX_KEYS} keys.`
          );
        }

        updates.push({
          studentId: st.id,
          studentName: st.studentNameBn || st.studentNameEn,
          examResults: sanitized,
          patchKeys: {
            [contKey]: contVal,
            [sumKey]: sumVal,
            [totalKey]: contVal !== null || sumVal !== null ? (contVal ?? 0) + (sumVal ?? 0) : null,
          },
        });
      }

      if (isAdmin) {
        const batch = writeBatch(instances.db);
        for (const u of updates) {
          const ref = doc(instances.db, 'schools', session.schoolId, 'students', u.studentId);
          batch.update(ref, {
            examResults: u.examResults,
            lastUpdatedByName: session.name,
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
        setDirtyIds(new Set());
        setBanner({ type: 'success', text: t(lang, 'savedSuccess') });
      } else {
        const pendingDoc = buildPendingChangePayload({
          schoolId: session.schoolId,
          entityType: 'STUDENT_BATCH_UPDATE',
          targetId: `${selectedAcademicYear}_${selectedClass}_${selectedTerm}_${selectedSubjectId}`,
          submittedByDeviceId: session.deviceId,
          submittedByName: session.name,
          summary: `Batch Marks: ${activeSubject?.subjectName || selectedSubjectId} (${selectedTerm}, ${selectedClass})`,
          detailsText: `${updates.length} student mark rows updated`,
          payloadJson: JSON.stringify({
            kind: 'EXAM_MARKS',
            examId: selectedTerm,
            subjectId: selectedSubjectId,
            updates: updates.map((u) => ({
              studentId: u.studentId,
              studentName: u.studentName,
              examResultsPatch: u.patchKeys,
            })),
          }),
          status: 'PENDING',
        });

        await addDoc(
          collection(instances.db, 'schools', session.schoolId, 'pendingChanges'),
          pendingDoc
        );
        setDirtyIds(new Set());
        setBanner({ type: 'success', text: t(lang, 'submittedApprovalSuccess') });
      }
    } catch (err) {
      setBanner({
        type: 'error',
        text: `${t(lang, 'errorPrefix')} ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {banner && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-sm ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="p-1 hover:opacity-70 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {t(lang, 'selectTerm')}
            </label>
            <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg">
              {TERM_ORDER.map((termId) => {
                const label =
                  termId === 'exam_1'
                    ? t(lang, 'term1')
                    : termId === 'exam_2'
                    ? t(lang, 'term2')
                    : t(lang, 'term3');
                return (
                  <button
                    key={termId}
                    type="button"
                    onClick={() => setSelectedTerm(termId)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      selectedTerm === termId
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-[200px]">
            <label
              htmlFor="batch-subject-select"
              className="block text-xs font-medium text-slate-600 mb-1"
            >
              {t(lang, 'selectSubject')}
            </label>
            <select
              id="batch-subject-select"
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              {classSubjects.length === 0 ? (
                <option value="">{t(lang, 'noSubjectsConfigured')}</option>
              ) : (
                classSubjects.map((s) => (
                  <option key={s.subjectId} value={s.subjectId}>
                    {s.subjectName} ({t(lang, 'fullMarks')}: {s.fullMarks})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <button
          type="button"
          disabled={saving || dirtyIds.size === 0 || !selectedSubjectId}
          onClick={handleSaveAll}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          {isAdmin ? <Save className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          <span>
            {saving
              ? t(lang, 'loading')
              : isAdmin
              ? `${t(lang, 'saveAllMarks')} (${dirtyIds.size})`
              : `${t(lang, 'submitMarksForApproval')} (${dirtyIds.size})`}
          </span>
        </button>
      </div>

      <p className="text-xs text-slate-500 px-1">{t(lang, 'keyboardTip')}</p>

      {/* Spreadsheet Grid */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {classSubjects.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {t(lang, 'noSubjectsConfigured')}
          </div>
        ) : classStudents.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {t(lang, 'noStudentsFound')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4 w-20">{t(lang, 'rollNumber')}</th>
                  <th className="py-3 px-4">{lang === 'bn' ? 'শিক্ষার্থীর নাম' : 'Student Name'}</th>
                  <th className="py-3 px-3 text-center w-32">
                    {t(lang, 'contShort')}
                  </th>
                  <th className="py-3 px-3 text-center w-32">
                    {t(lang, 'sumShort')}
                  </th>
                  <th className="py-3 px-4 text-right w-28">
                    {t(lang, 'totalShort')} ({activeSubject?.fullMarks || 100})
                  </th>
                  <th className="py-3 px-4 text-right w-28">{t(lang, 'avg3Term')}</th>
                  <th className="py-3 px-4 text-center w-24">{t(lang, 'gradeInternal')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {classStudents.map((st, rowIdx) => {
                  const isDirty = dirtyIds.has(st.id);
                  const d = drafts[st.id] || { cont: '', sum: '' };
                  const stats = computeRowStats(st.id, st.examResults);
                  const exceedsMax =
                    stats.currentTotal !== null && stats.currentTotal > stats.fullMarks;

                  return (
                    <tr
                      key={st.id}
                      className={isDirty ? 'bg-amber-50/50' : 'hover:bg-stone-50/60'}
                    >
                      <td className="py-2 px-4 font-mono tabular-nums font-semibold text-slate-900">
                        {st.rollNumber}
                      </td>
                      <td className="py-2 px-4">
                        <div className="font-medium text-slate-900">
                          {st.studentNameBn || st.studentNameEn}
                        </div>
                        {st.studentNameBn && st.studentNameEn && (
                          <div className="text-xs text-slate-500">{st.studentNameEn}</div>
                        )}
                      </td>
                      <td className="py-1.5 px-3">
                        <input
                          ref={(el) => {
                            inputRefs.current[`${st.id}_cont`] = el;
                          }}
                          type="text"
                          inputMode="decimal"
                          value={d.cont}
                          onChange={(e) => handleCellChange(st.id, 'cont', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, rowIdx, 'cont')}
                          placeholder="0"
                          className="w-full px-2.5 py-1.5 text-center font-mono tabular-nums text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                        />
                      </td>
                      <td className="py-1.5 px-3">
                        <input
                          ref={(el) => {
                            inputRefs.current[`${st.id}_sum`] = el;
                          }}
                          type="text"
                          inputMode="decimal"
                          value={d.sum}
                          onChange={(e) => handleCellChange(st.id, 'sum', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, rowIdx, 'sum')}
                          placeholder="0"
                          className="w-full px-2.5 py-1.5 text-center font-mono tabular-nums text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                        />
                      </td>
                      <td
                        className={`py-2 px-4 text-right font-mono tabular-nums font-semibold ${
                          exceedsMax ? 'text-rose-600' : 'text-slate-900'
                        }`}
                      >
                        {stats.currentTotal !== null ? stats.currentTotal : '—'}
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-700">
                        {stats.avg3Term !== null ? stats.avg3Term : '—'}
                      </td>
                      <td className="py-2 px-4 text-center font-mono font-semibold">
                        {stats.grade ? (
                          <span
                            className={
                              stats.grade.passed ? 'text-emerald-700' : 'text-rose-600'
                            }
                          >
                            {stats.grade.grade}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
