import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { Download, FileSpreadsheet, Printer, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '../contexts/AppContext';
import { getFirebaseInstances } from '../lib/firebase';
import {
  buildPendingChangePayload,
  FIRESTORE_LIMITS,
  sanitizeRecordMap,
  validateAndBuildStudentPayload,
} from '../lib/firestoreValidation';
import { getClassLabel, t } from '../lib/i18n';
import {
  computeFinalExamMeritMap,
  computeStudentTermSummary,
  formatPhotoSrc,
  getClassSubjectsForMarksheet,
  getTermSubjectScore,
  normalizeExamConfigs,
} from '../lib/schoolUtils';
import type { StudentDoc } from '../types/school';

export const MarksheetView: React.FC = () => {
  const {
    lang,
    session,
    school,
    students,
    selectedAcademicYear,
    selectedClass,
  } = useApp();

  const isAdmin = session?.role === 'ADMIN';
  const [viewMode, setViewMode] = useState<'card' | 'tabulation'>('card');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [importBanner, setImportBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const classStudents = useMemo(
    () =>
      students.filter(
        (s) =>
          Number(s.academicYear) === Number(selectedAcademicYear) &&
          s.classLevel === selectedClass
      ),
    [students, selectedAcademicYear, selectedClass]
  );

  useEffect(() => {
    if (classStudents.length > 0) {
      if (!classStudents.some((s) => s.id === selectedStudentId)) {
        setSelectedStudentId(classStudents[0].id);
      }
    } else {
      setSelectedStudentId('');
    }
  }, [classStudents, selectedStudentId]);

  const activeStudent = useMemo(
    () => classStudents.find((s) => s.id === selectedStudentId) || null,
    [classStudents, selectedStudentId]
  );

  const examConfigs = useMemo(
    () => normalizeExamConfigs(school?.examConfigs),
    [school?.examConfigs]
  );

  const classSubjects = useMemo(
    () => getClassSubjectsForMarksheet(examConfigs, selectedClass),
    [examConfigs, selectedClass]
  );

  const meritMap = useMemo(
    () => computeFinalExamMeritMap(classStudents, classSubjects),
    [classStudents, classSubjects]
  );

  // Build individual student 3-term marksheet rows & bottom totals
  const buildStudentMarksheetData = (st: StudentDoc) => {
    let fullMarksSum = 0;
    let t1ContSum = 0;
    let t1SumSum = 0;
    let t1TotalSum = 0;
    let t2ContSum = 0;
    let t2SumSum = 0;
    let t2TotalSum = 0;
    let t3ContSum = 0;
    let t3SumSum = 0;
    let t3TotalSum = 0;
    let avgSum = 0;
    let avgCount = 0;

    const rows = classSubjects.map((subj) => {
      const s1 = getTermSubjectScore(st.examResults, 'exam_1', subj.subjectId);
      const s2 = getTermSubjectScore(st.examResults, 'exam_2', subj.subjectId);
      const s3 = getTermSubjectScore(st.examResults, 'exam_3', subj.subjectId);

      const termTotals = [s1, s2, s3]
        .filter((s) => s.hasScore && s.total !== null)
        .map((s) => s.total as number);
      const rowAvg =
        termTotals.length > 0
          ? Number((termTotals.reduce((a, b) => a + b, 0) / termTotals.length).toFixed(1))
          : null;

      fullMarksSum += subj.fullMarks;
      if (s1.cont !== null) t1ContSum += s1.cont;
      if (s1.sum !== null) t1SumSum += s1.sum;
      if (s1.total !== null) t1TotalSum += s1.total;

      if (s2.cont !== null) t2ContSum += s2.cont;
      if (s2.sum !== null) t2SumSum += s2.sum;
      if (s2.total !== null) t2TotalSum += s2.total;

      if (s3.cont !== null) t3ContSum += s3.cont;
      if (s3.sum !== null) t3SumSum += s3.sum;
      if (s3.total !== null) t3TotalSum += s3.total;

      if (rowAvg !== null) {
        avgSum += rowAvg;
        avgCount += 1;
      }

      return {
        subj,
        s1,
        s2,
        s3,
        rowAvg,
      };
    });

    const overallAvg = avgCount > 0 ? Number(avgSum.toFixed(1)) : null;

    const term1Summary = computeStudentTermSummary(st, classSubjects, 'exam_1');
    const term2Summary = computeStudentTermSummary(st, classSubjects, 'exam_2');
    const term3Summary = computeStudentTermSummary(st, classSubjects, 'exam_3');
    const meritRank = meritMap.get(st.id) || null;

    return {
      rows,
      totals: {
        fullMarksSum,
        t1ContSum,
        t1SumSum,
        t1TotalSum,
        t2ContSum,
        t2SumSum,
        t2TotalSum,
        t3ContSum,
        t3SumSum,
        t3TotalSum,
        overallAvg,
      },
      term1Summary,
      term2Summary,
      term3Summary,
      meritRank,
    };
  };

  const activeData = useMemo(
    () => (activeStudent ? buildStudentMarksheetData(activeStudent) : null),
    [activeStudent, classSubjects, meritMap]
  );

  // Export 3-Term Marksheet (NO Pass Marks column!)
  const exportMarksheetFile = (format: 'xlsx' | 'csv') => {
    if (!activeStudent || !activeData) return;

    const headerRow1 = [
      'Subject',
      'Full Marks',
      '1st Term',
      '',
      '',
      '2nd Term',
      '',
      '',
      'Final Term',
      '',
      '',
      '3-Term Average',
    ];
    const headerRow2 = [
      '',
      '',
      'Cont.',
      'Sum.',
      'Total',
      'Cont.',
      'Sum.',
      'Total',
      'Cont.',
      'Sum.',
      'Total',
      '',
    ];

    const bodyRows = activeData.rows.map((r) => [
      r.subj.subjectName,
      r.subj.fullMarks,
      r.s1.cont ?? '',
      r.s1.sum ?? '',
      r.s1.total ?? '',
      r.s2.cont ?? '',
      r.s2.sum ?? '',
      r.s2.total ?? '',
      r.s3.cont ?? '',
      r.s3.sum ?? '',
      r.s3.total ?? '',
      r.rowAvg ?? '',
    ]);

    const totalsRow = [
      'Totals',
      activeData.totals.fullMarksSum,
      activeData.totals.t1ContSum,
      activeData.totals.t1SumSum,
      activeData.totals.t1TotalSum,
      activeData.totals.t2ContSum,
      activeData.totals.t2SumSum,
      activeData.totals.t2TotalSum,
      activeData.totals.t3ContSum,
      activeData.totals.t3SumSum,
      activeData.totals.t3TotalSum,
      activeData.totals.overallAvg ?? '',
    ];

    const aoa = [
      [`${school?.schoolName || 'My School'} — 3-Term Marksheet`],
      [
        `Student: ${activeStudent.studentNameBn || activeStudent.studentNameEn}`,
        `Roll: ${activeStudent.rollNumber}`,
        `Class: ${selectedClass}`,
        `Year: ${selectedAcademicYear}`,
        `Final GPA: ${activeData.term3Summary.gpa.toFixed(2)} (${activeData.term3Summary.grade})`,
        activeData.meritRank ? `Merit Rank: #${activeData.meritRank}` : '',
      ],
      [],
      headerRow1,
      headerRow2,
      ...bodyRows,
      totalsRow,
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [
      { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } },
      { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } },
      { s: { r: 3, c: 2 }, e: { r: 3, c: 4 } },
      { s: { r: 3, c: 5 }, e: { r: 3, c: 7 } },
      { s: { r: 3, c: 8 }, e: { r: 3, c: 10 } },
      { s: { r: 3, c: 11 }, e: { r: 4, c: 11 } },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '3-Term Marksheet');
    const safeRoll = String(activeStudent.rollNumber || 'student').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Marksheet_${selectedClass.replace(/\s+/g, '_')}_Roll_${safeRoll}_${selectedAcademicYear}.${format}`;
    XLSX.writeFile(wb, filename, { bookType: format });
  };

  // Export full class tabulation + student roster compatible with Android app
  const exportClassRosterOrTabulation = (format: 'xlsx' | 'csv') => {
    const rows = classStudents.map((st) => {
      const t1 = computeStudentTermSummary(st, classSubjects, 'exam_1');
      const t2 = computeStudentTermSummary(st, classSubjects, 'exam_2');
      const t3 = computeStudentTermSummary(st, classSubjects, 'exam_3');
      const merit = meritMap.get(st.id) || '';

      const base: Record<string, string | number> = {
        rollNumber: st.rollNumber,
        studentNameBn: st.studentNameBn || '',
        studentNameEn: st.studentNameEn || '',
        fatherNameEn: st.fatherNameEn || '',
        motherNameEn: st.motherNameEn || '',
        dateOfBirth: st.dateOfBirth || '',
        guardianPhone: st.guardianPhone || '',
        address: st.address || '',
        classLevel: st.classLevel,
        section: st.section || '',
        academicYear: st.academicYear,
        totalSchoolDays: st.totalSchoolDays || 0,
        daysPresent: st.daysPresent || 0,
        promotionStatus: st.promotionStatus || '',
        term1Total: t1.totalObtained,
        term2Total: t2.totalObtained,
        finalTotal: t3.totalObtained,
        finalGpa: t3.scoredSubjects > 0 ? t3.gpa.toFixed(2) : '',
        finalGrade: t3.grade,
        finalMeritRank: merit,
      };

      for (const subj of classSubjects) {
        const s1 = getTermSubjectScore(st.examResults, 'exam_1', subj.subjectId);
        const s2 = getTermSubjectScore(st.examResults, 'exam_2', subj.subjectId);
        const s3 = getTermSubjectScore(st.examResults, 'exam_3', subj.subjectId);
        base[`${subj.subjectName} (1st Total)`] = s1.total ?? '';
        base[`${subj.subjectName} (2nd Total)`] = s2.total ?? '';
        base[`${subj.subjectName} (Final Total)`] = s3.total ?? '';
      }

      return base;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Class Tabulation');
    const filename = `${selectedClass.replace(/\s+/g, '_')}_${selectedAcademicYear}_Roster.${format}`;
    XLSX.writeFile(wb, filename, { bookType: format });
  };

  // Import students from .xlsx / .csv
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    const instances = getFirebaseInstances();
    if (!instances) return;

    setImporting(true);
    setImportBanner(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: '',
      });

      if (rawRows.length === 0) {
        throw new Error('The uploaded spreadsheet is empty.');
      }

      const parsedStudents: Array<{ existingId?: string; data: Partial<StudentDoc> }> = [];
      for (const row of rawRows) {
        const nameBn = String(row.studentNameBn || row['Student Name (Bangla)'] || row['Name (Bn)'] || '').trim();
        const nameEn = String(row.studentNameEn || row['Student Name (English)'] || row['Name'] || '').trim();
        if (!nameBn && !nameEn) continue;

        const roll = String(row.rollNumber || row['Roll'] || row['Roll No'] || '').trim();
        const cls = String(row.classLevel || row['Class'] || selectedClass).trim();
        const yr = Number(row.academicYear || row['Year'] || selectedAcademicYear) || selectedAcademicYear;

        const existingMatch = students.find(
          (s) =>
            Number(s.academicYear) === yr &&
            s.classLevel === cls &&
            roll !== '' &&
            String(s.rollNumber) === roll
        );

        const nextResults: Record<string, number | string> = {
          ...(existingMatch?.examResults || {}),
        };

        // Optional subject columns if present in format "Subject__exam_1__cont" or matching subject names
        for (const subj of classSubjects) {
          const contKey = `${subj.subjectName} (Final Cont)`;
          const sumKey = `${subj.subjectName} (Final Sum)`;
          if (row[contKey] !== undefined && row[contKey] !== '') {
            nextResults[`exam_3__${subj.subjectId}__cont`] = Number(row[contKey]) || 0;
          }
          if (row[sumKey] !== undefined && row[sumKey] !== '') {
            nextResults[`exam_3__${subj.subjectId}__sum`] = Number(row[sumKey]) || 0;
          }
        }

        const sanitizedResults = sanitizeRecordMap(nextResults);
        if (Object.keys(sanitizedResults).length > FIRESTORE_LIMITS.EXAM_RESULTS_MAX_KEYS) {
          throw new Error('Imported marks exceed Firestore examResults key limit.');
        }

        parsedStudents.push({
          existingId: existingMatch?.id,
          data: {
            studentNameBn: nameBn || nameEn,
            studentNameEn: nameEn || nameBn,
            fatherNameEn: String(row.fatherNameEn || row["Father's Name"] || '').trim(),
            motherNameEn: String(row.motherNameEn || row["Mother's Name"] || '').trim(),
            dateOfBirth: String(row.dateOfBirth || row['Date of Birth'] || '').trim(),
            guardianPhone: String(row.guardianPhone || row['Guardian Phone'] || '').trim(),
            address: String(row.address || row['Address'] || '').trim(),
            rollNumber: roll,
            classLevel: cls,
            section: String(row.section || row['Section'] || '').trim(),
            academicYear: yr,
            totalSchoolDays: Number(row.totalSchoolDays || 0),
            daysPresent: Number(row.daysPresent || 0),
            promotionStatus: String(row.promotionStatus || '').trim(),
            examResults: sanitizedResults,
          },
        });
      }

      if (parsedStudents.length === 0) {
        throw new Error(
          'No valid student rows found. Include columns like studentNameBn, studentNameEn, rollNumber.'
        );
      }

      if (isAdmin) {
        // Commit in chunks of 400 (Firestore batch limit is 500)
        for (let i = 0; i < parsedStudents.length; i += 400) {
          const chunk = parsedStudents.slice(i, i + 400);
          const batch = writeBatch(instances.db);
          for (const item of chunk) {
            const existing = item.existingId
              ? students.find((s) => s.id === item.existingId)
              : undefined;
            const payload = validateAndBuildStudentPayload(
              { ...existing, ...item.data },
              session.schoolId,
              session.name,
              existing?.createdAt
            );
            const targetRef = item.existingId
              ? doc(instances.db, 'schools', session.schoolId, 'students', item.existingId)
              : doc(collection(instances.db, 'schools', session.schoolId, 'students'));
            batch.set(targetRef, payload, { merge: true });
          }
          await batch.commit();
        }
        setImportBanner({
          type: 'success',
          text: `${parsedStudents.length} ${lang === 'bn' ? 'জন শিক্ষার্থী ইম্পোর্ট হয়েছে।' : 'students imported successfully.'}`,
        });
      } else {
        const pendingDoc = buildPendingChangePayload({
          schoolId: session.schoolId,
          entityType: 'STUDENT_BATCH_UPDATE',
          targetId: `import_${selectedAcademicYear}_${selectedClass}_${Date.now()}`,
          submittedByDeviceId: session.deviceId,
          submittedByName: session.name,
          summary: `Spreadsheet Import: ${parsedStudents.length} students (${selectedClass})`,
          detailsText: `Imported from ${file.name}`,
          payloadJson: JSON.stringify({
            kind: 'ROSTER_IMPORT',
            students: parsedStudents,
          }),
          status: 'PENDING',
        });

        await addDoc(
          collection(instances.db, 'schools', session.schoolId, 'pendingChanges'),
          pendingDoc
        );
        setImportBanner({ type: 'success', text: t(lang, 'submittedApprovalSuccess') });
      }
    } catch (err) {
      setImportBanner({
        type: 'error',
        text: `${t(lang, 'errorPrefix')} ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5">
      {importBanner && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-sm no-print ${
            importBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{importBanner.text}</span>
          <button
            type="button"
            onClick={() => setImportBanner(null)}
            className="p-1 hover:opacity-70 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Action Toolbar */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4 no-print">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'card'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t(lang, 'individualCard')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('tabulation')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'tabulation'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t(lang, 'classTabulation')}
            </button>
          </div>

          {viewMode === 'card' && classStudents.length > 0 && (
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="px-3 py-1.5 text-sm bg-white border border-stone-300 rounded-lg min-w-[220px]"
            >
              {classStudents.map((st) => (
                <option key={st.id} value={st.id}>
                  Roll {st.rollNumber} — {st.studentNameBn || st.studentNameEn}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {viewMode === 'card' && activeStudent && (
            <>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{t(lang, 'printMarksheet')}</span>
              </button>
              <button
                type="button"
                onClick={() => exportMarksheetFile('xlsx')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 cursor-pointer whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>{t(lang, 'exportExcel')}</span>
              </button>
              <button
                type="button"
                onClick={() => exportMarksheetFile('csv')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t(lang, 'exportCsv')}</span>
              </button>
            </>
          )}

          {viewMode === 'tabulation' && (
            <>
              <button
                type="button"
                onClick={() => exportClassRosterOrTabulation('xlsx')}
                disabled={classStudents.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg cursor-pointer whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{t(lang, 'exportStudentsRoster')}</span>
              </button>
              <button
                type="button"
                onClick={() => exportClassRosterOrTabulation('csv')}
                disabled={classStudents.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t(lang, 'exportCsv')}</span>
              </button>
              <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 cursor-pointer whitespace-nowrap">
                <Upload className="w-3.5 h-3.5 text-emerald-700" />
                <span>{importing ? t(lang, 'loading') : t(lang, 'importExcelCsv')}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </label>
            </>
          )}
        </div>
      </div>

      {/* Individual 3-Term Marksheet Card */}
      {viewMode === 'card' && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 sm:p-8 print-card">
          {!activeStudent || !activeData ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {t(lang, 'noStudentsFound')}
            </div>
          ) : classSubjects.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {t(lang, 'noSubjectsConfigured')}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Academic Report Card Header */}
              <div className="text-center border-b-2 border-slate-800 pb-4 space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                  {school?.schoolName || 'My School'}
                </h2>
                <p className="text-xs text-slate-600">
                  {school?.upazilaDistrict ? `${school.upazilaDistrict} · ` : ''}
                  {school?.emisCode ? `EMIS: ${school.emisCode} · ` : ''}
                  {t(lang, 'academicYear')}: {selectedAcademicYear}
                </p>
                <div className="pt-1 text-sm font-semibold uppercase tracking-wide text-emerald-800">
                  {lang === 'bn'
                    ? '৩-সাময়িকী সমন্বিত নম্বরপত্র (মার্কশিট)'
                    : '3-Term Consolidated Academic Marksheet'}
                </div>
              </div>

              {/* Student Particulars */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-stone-50 border border-stone-200 rounded-lg p-4 text-sm">
                <div className="flex items-center gap-4">
                  {formatPhotoSrc(activeStudent.photoBase64) && (
                    <img
                      src={formatPhotoSrc(activeStudent.photoBase64)!}
                      alt={activeStudent.studentNameEn || activeStudent.studentNameBn}
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded-lg object-cover border border-stone-300"
                    />
                  )}
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900 text-base">
                      {activeStudent.studentNameBn || activeStudent.studentNameEn}
                    </div>
                    {activeStudent.studentNameBn && activeStudent.studentNameEn && (
                      <div className="text-xs text-slate-600">{activeStudent.studentNameEn}</div>
                    )}
                    <div className="text-xs text-slate-600">
                      {t(lang, 'fatherNameEn')}: {activeStudent.fatherNameEn || '—'} ·{' '}
                      {t(lang, 'motherNameEn')}: {activeStudent.motherNameEn || '—'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs">
                  <div>
                    <span className="text-slate-500">{t(lang, 'classSelector')}:</span>{' '}
                    <strong className="text-slate-900">{getClassLabel(selectedClass, lang)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">{t(lang, 'rollNumber')}:</span>{' '}
                    <strong className="font-mono tabular-nums text-slate-900">
                      {activeStudent.rollNumber}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">{t(lang, 'section')}:</span>{' '}
                    <strong className="text-slate-900">{activeStudent.section || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">{t(lang, 'meritPosition')}:</span>{' '}
                    <strong className="font-mono tabular-nums text-emerald-800">
                      {activeData.meritRank ? `#${activeData.meritRank}` : t(lang, 'notQualified')}
                    </strong>
                  </div>
                </div>
              </div>

              {/* 2-Tier 3-Term Marksheet Table (STRICTLY NO Pass Marks column) */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm border-collapse border border-stone-300">
                  <thead>
                    <tr className="bg-stone-100 text-slate-800 font-semibold">
                      <th
                        rowSpan={2}
                        className="border border-stone-300 py-2.5 px-3 text-left align-middle"
                      >
                        {t(lang, 'subject')}
                      </th>
                      <th
                        rowSpan={2}
                        className="border border-stone-300 py-2.5 px-2 text-center align-middle w-20"
                      >
                        {t(lang, 'fullMarks')}
                      </th>
                      <th
                        colSpan={3}
                        className="border border-stone-300 py-2 px-2 text-center bg-emerald-50/70"
                      >
                        {t(lang, 'term1')}
                      </th>
                      <th
                        colSpan={3}
                        className="border border-stone-300 py-2 px-2 text-center bg-sky-50/60"
                      >
                        {t(lang, 'term2')}
                      </th>
                      <th
                        colSpan={3}
                        className="border border-stone-300 py-2 px-2 text-center bg-amber-50/60"
                      >
                        {t(lang, 'term3')}
                      </th>
                      <th
                        rowSpan={2}
                        className="border border-stone-300 py-2.5 px-2 text-center align-middle w-24"
                      >
                        {t(lang, 'avg3Term')}
                      </th>
                    </tr>
                    <tr className="bg-stone-50 text-slate-600 text-xs font-medium">
                      <th className="border border-stone-300 py-1.5 px-2 text-center">
                        {t(lang, 'contShort')}
                      </th>
                      <th className="border border-stone-300 py-1.5 px-2 text-center">
                        {t(lang, 'sumShort')}
                      </th>
                      <th className="border border-stone-300 py-1.5 px-2 text-center font-semibold text-slate-900">
                        {t(lang, 'totalShort')}
                      </th>
                      <th className="border border-stone-300 py-1.5 px-2 text-center">
                        {t(lang, 'contShort')}
                      </th>
                      <th className="border border-stone-300 py-1.5 px-2 text-center">
                        {t(lang, 'sumShort')}
                      </th>
                      <th className="border border-stone-300 py-1.5 px-2 text-center font-semibold text-slate-900">
                        {t(lang, 'totalShort')}
                      </th>
                      <th className="border border-stone-300 py-1.5 px-2 text-center">
                        {t(lang, 'contShort')}
                      </th>
                      <th className="border border-stone-300 py-1.5 px-2 text-center">
                        {t(lang, 'sumShort')}
                      </th>
                      <th className="border border-stone-300 py-1.5 px-2 text-center font-semibold text-slate-900">
                        {t(lang, 'totalShort')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeData.rows.map(({ subj, s1, s2, s3, rowAvg }) => (
                      <tr key={subj.subjectId} className="hover:bg-stone-50/60">
                        <td className="border border-stone-300 py-2 px-3 font-medium text-slate-900">
                          {subj.subjectName}
                        </td>
                        <td className="border border-stone-300 py-2 px-2 text-center font-mono tabular-nums text-slate-700">
                          {subj.fullMarks}
                        </td>
                        {/* Term 1 */}
                        <td className="border border-stone-300 py-2 px-2 text-center font-mono tabular-nums text-slate-700">
                          {s1.cont ?? '—'}
                        </td>
                        <td className="border border-stone-300 py-2 px-2 text-center font-mono tabular-nums text-slate-700">
                          {s1.sum ?? '—'}
                        </td>
                        <td className="border border-stone-300 py-2 px-2 text-center font-mono tabular-nums font-semibold text-slate-900 bg-emerald-50/20">
                          {s1.total ?? '—'}
                        </td>
                        {/* Term 2 */}
                        <td className="border border-stone-300 py-2 px-2 text-center font-mono tabular-nums text-slate-700">
                          {s2.cont ?? '—'}
                        </td>
                        <td className="border border-stone-300 py-2 px-2 text-center font-mono tabular-nums text-slate-700">
                          {s2.sum ?? '—'}
                        </td>
                        <td className="border border-stone-300 py-2 px-2 text-center font-mono tabular-nums font-semibold text-slate-900 bg-sky-50/20">
                          {s2.total ?? '—'}
                        </td>
                        {/* Term 3 */}
                        <td className="border border-stone-300 py-2 px-2 text-center font-mono tabular-nums text-slate-700">
                          {s3.cont ?? '—'}
                        </td>
                        <td className="border border-stone-300 py-2 px-2 text-center font-mono tabular-nums text-slate-700">
                          {s3.sum ?? '—'}
                        </td>
                        <td className="border border-stone-300 py-2 px-2 text-center font-mono tabular-nums font-semibold text-slate-900 bg-amber-50/20">
                          {s3.total ?? '—'}
                        </td>
                        {/* 3-Term Avg */}
                        <td className="border border-stone-300 py-2 px-2 text-center font-mono tabular-nums font-semibold text-slate-900">
                          {rowAvg ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-stone-100 font-bold text-slate-900">
                      <td className="border border-stone-300 py-2.5 px-3">
                        {t(lang, 'totalsRow')}
                      </td>
                      <td className="border border-stone-300 py-2.5 px-2 text-center font-mono tabular-nums">
                        {activeData.totals.fullMarksSum}
                      </td>
                      <td className="border border-stone-300 py-2.5 px-2 text-center font-mono tabular-nums">
                        {activeData.totals.t1ContSum}
                      </td>
                      <td className="border border-stone-300 py-2.5 px-2 text-center font-mono tabular-nums">
                        {activeData.totals.t1SumSum}
                      </td>
                      <td className="border border-stone-300 py-2.5 px-2 text-center font-mono tabular-nums">
                        {activeData.totals.t1TotalSum}
                      </td>
                      <td className="border border-stone-300 py-2.5 px-2 text-center font-mono tabular-nums">
                        {activeData.totals.t2ContSum}
                      </td>
                      <td className="border border-stone-300 py-2.5 px-2 text-center font-mono tabular-nums">
                        {activeData.totals.t2SumSum}
                      </td>
                      <td className="border border-stone-300 py-2.5 px-2 text-center font-mono tabular-nums">
                        {activeData.totals.t2TotalSum}
                      </td>
                      <td className="border border-stone-300 py-2.5 px-2 text-center font-mono tabular-nums">
                        {activeData.totals.t3ContSum}
                      </td>
                      <td className="border border-stone-300 py-2.5 px-2 text-center font-mono tabular-nums">
                        {activeData.totals.t3SumSum}
                      </td>
                      <td className="border border-stone-300 py-2.5 px-2 text-center font-mono tabular-nums">
                        {activeData.totals.t3TotalSum}
                      </td>
                      <td className="border border-stone-300 py-2.5 px-2 text-center font-mono tabular-nums">
                        {activeData.totals.overallAvg ?? '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Internal Bangladesh GPA & Merit Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 text-xs">
                <div className="border border-stone-200 rounded-lg p-3 bg-stone-50">
                  <div className="text-slate-500">{t(lang, 'term1')} GPA / Grade</div>
                  <div className="mt-1 text-base font-bold font-mono tabular-nums text-slate-900">
                    {activeData.term1Summary.scoredSubjects > 0
                      ? `${activeData.term1Summary.gpa.toFixed(2)} (${activeData.term1Summary.grade})`
                      : '—'}
                  </div>
                </div>
                <div className="border border-stone-200 rounded-lg p-3 bg-stone-50">
                  <div className="text-slate-500">{t(lang, 'term2')} GPA / Grade</div>
                  <div className="mt-1 text-base font-bold font-mono tabular-nums text-slate-900">
                    {activeData.term2Summary.scoredSubjects > 0
                      ? `${activeData.term2Summary.gpa.toFixed(2)} (${activeData.term2Summary.grade})`
                      : '—'}
                  </div>
                </div>
                <div className="border border-stone-200 rounded-lg p-3 bg-stone-50">
                  <div className="text-slate-500">{t(lang, 'term3')} GPA / Grade</div>
                  <div className="mt-1 text-base font-bold font-mono tabular-nums text-slate-900">
                    {activeData.term3Summary.scoredSubjects > 0
                      ? `${activeData.term3Summary.gpa.toFixed(2)} (${activeData.term3Summary.grade})`
                      : '—'}
                  </div>
                </div>
                <div className="border border-stone-200 rounded-lg p-3 bg-emerald-50/70">
                  <div className="text-emerald-800">{t(lang, 'meritPosition')}</div>
                  <div className="mt-1 text-base font-bold font-mono tabular-nums text-emerald-900">
                    {activeData.meritRank ? `#${activeData.meritRank}` : t(lang, 'notQualified')}
                  </div>
                </div>
              </div>

              {/* Signatures for Print */}
              <div className="pt-10 grid grid-cols-2 gap-12 text-xs text-slate-700">
                <div className="text-center">
                  <div className="border-t border-slate-400 pt-1.5 mx-6">
                    {t(lang, 'classTeacherSign')}
                  </div>
                </div>
                <div className="text-center">
                  <div className="border-t border-slate-400 pt-1.5 mx-6">
                    {t(lang, 'headTeacherSign')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Class Tabulation Table */}
      {viewMode === 'tabulation' && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          {classStudents.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {t(lang, 'noStudentsFound')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">{t(lang, 'rollNumber')}</th>
                    <th className="py-3 px-4">{lang === 'bn' ? 'শিক্ষার্থীর নাম' : 'Student Name'}</th>
                    <th className="py-3 px-4 text-right">{t(lang, 'term1')}</th>
                    <th className="py-3 px-4 text-right">{t(lang, 'term2')}</th>
                    <th className="py-3 px-4 text-right">{t(lang, 'term3')}</th>
                    <th className="py-3 px-4 text-right">GPA / Grade</th>
                    <th className="py-3 px-4 text-right">{t(lang, 'meritPosition')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {classStudents.map((st) => {
                    const t1 = computeStudentTermSummary(st, classSubjects, 'exam_1');
                    const t2 = computeStudentTermSummary(st, classSubjects, 'exam_2');
                    const t3 = computeStudentTermSummary(st, classSubjects, 'exam_3');
                    const rank = meritMap.get(st.id);

                    return (
                      <tr
                        key={st.id}
                        onClick={() => {
                          setSelectedStudentId(st.id);
                          setViewMode('card');
                        }}
                        className="hover:bg-stone-50 cursor-pointer"
                      >
                        <td className="py-2.5 px-4 font-mono tabular-nums font-semibold text-slate-900">
                          {st.rollNumber}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {st.studentNameBn || st.studentNameEn}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                          {t1.scoredSubjects > 0 ? t1.totalObtained : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                          {t2.scoredSubjects > 0 ? t2.totalObtained : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {t3.scoredSubjects > 0 ? t3.totalObtained : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {t3.scoredSubjects > 0 ? (
                            <span className={t3.passed ? 'text-emerald-700 font-semibold' : 'text-rose-600 font-semibold'}>
                              {t3.gpa.toFixed(2)} ({t3.grade})
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-800">
                          {rank ? `#${rank}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
