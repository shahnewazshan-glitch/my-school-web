import React, { useEffect, useMemo, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { CheckCheck, Save, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { getFirebaseInstances } from '../lib/firebase';
import { buildAttendancePayload } from '../lib/firestoreValidation';
import { getClassLabel, t } from '../lib/i18n';
import { getAttendanceDocId, getTodayDateKey } from '../lib/schoolUtils';
import type { AttendanceStatus } from '../types/school';

export const AttendanceView: React.FC = () => {
  const {
    lang,
    session,
    students,
    attendanceLogs,
    selectedAcademicYear,
    selectedClass,
  } = useApp();

  const [dateKey, setDateKey] = useState<string>(() => getTodayDateKey());
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
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

  const activeDocId = useMemo(
    () => getAttendanceDocId(selectedAcademicYear, selectedClass, dateKey),
    [selectedAcademicYear, selectedClass, dateKey]
  );

  const existingLog = useMemo(
    () => attendanceLogs.find((l) => l.id === activeDocId),
    [attendanceLogs, activeDocId]
  );

  useEffect(() => {
    setStatuses(existingLog?.statuses ? { ...existingLog.statuses } : {});
  }, [existingLog, activeDocId]);

  const counts = useMemo(() => {
    let p = 0;
    let a = 0;
    let l = 0;
    for (const st of classStudents) {
      const val = statuses[st.id];
      if (val === 'P') p += 1;
      else if (val === 'A') a += 1;
      else if (val === 'L') l += 1;
    }
    return { p, a, l };
  }, [classStudents, statuses]);

  const monthKey = dateKey.slice(0, 7);

  const monthlyTotals = useMemo(() => {
    const map: Record<string, { p: number; a: number; l: number }> = {};
    for (const st of classStudents) {
      map[st.id] = { p: 0, a: 0, l: 0 };
    }
    const monthLogs = attendanceLogs.filter(
      (log) => log.classLevel === selectedClass && log.monthKey === monthKey
    );
    for (const log of monthLogs) {
      const stMap = log.statuses || {};
      for (const [sid, status] of Object.entries(stMap)) {
        if (!map[sid]) map[sid] = { p: 0, a: 0, l: 0 };
        if (status === 'P') map[sid].p += 1;
        else if (status === 'A') map[sid].a += 1;
        else if (status === 'L') map[sid].l += 1;
      }
    }
    return { map, totalDays: monthLogs.length };
  }, [attendanceLogs, classStudents, selectedClass, monthKey]);

  const handleMarkAllPresent = () => {
    const next: Record<string, AttendanceStatus> = { ...statuses };
    for (const st of classStudents) {
      next[st.id] = 'P';
    }
    setStatuses(next);
  };

  const handleSave = async () => {
    if (!session || !dateKey) return;
    const instances = getFirebaseInstances();
    if (!instances) return;

    setSaving(true);
    setBanner(null);

    try {
      const payload = buildAttendancePayload({
        schoolId: session.schoolId,
        academicYear: selectedAcademicYear,
        classLevel: selectedClass,
        dateKey,
        statuses,
        markedByName: session.name,
        existingCreatedAt: existingLog?.createdAt,
      });

      await setDoc(
        doc(instances.db, 'schools', session.schoolId, 'attendanceLogs', activeDocId),
        payload,
        { merge: true }
      );

      setBanner({ type: 'success', text: t(lang, 'savedSuccess') });
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

      {/* Header Controls */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label
              htmlFor="attendance-date"
              className="block text-xs font-medium text-slate-600 mb-1"
            >
              {t(lang, 'attendanceDate')}
            </label>
            <input
              id="attendance-date"
              type="date"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="text-xs text-slate-600 flex items-center gap-3 pb-2">
            <span>
              {t(lang, 'present')}:{' '}
              <strong className="font-mono tabular-nums text-emerald-700">{counts.p}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {t(lang, 'absent')}:{' '}
              <strong className="font-mono tabular-nums text-rose-600">{counts.a}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {t(lang, 'late')}:{' '}
              <strong className="font-mono tabular-nums text-amber-600">{counts.l}</strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleMarkAllPresent}
            disabled={classStudents.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <CheckCheck className="w-4 h-4 text-emerald-700" />
            <span>{t(lang, 'markAllPresent')}</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || classStudents.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? t(lang, 'loading') : t(lang, 'saveAttendance')}</span>
          </button>
        </div>
      </div>

      {/* Attendance Grid */}
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
                  <th className="py-3 px-4 w-20">{t(lang, 'rollNumber')}</th>
                  <th className="py-3 px-4">{lang === 'bn' ? 'শিক্ষার্থীর নাম' : 'Student Name'}</th>
                  <th className="py-3 px-4 text-center">{dateKey}</th>
                  <th className="py-3 px-4 text-right">
                    {t(lang, 'monthlySummary')} ({monthKey} · {monthlyTotals.totalDays}d)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {classStudents.map((st) => {
                  const current = statuses[st.id];
                  const mStat = monthlyTotals.map[st.id] || { p: 0, a: 0, l: 0 };
                  return (
                    <tr key={st.id} className="hover:bg-stone-50/60">
                      <td className="py-2.5 px-4 font-mono tabular-nums font-semibold text-slate-900">
                        {st.rollNumber}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">
                          {st.studentNameBn || st.studentNameEn}
                        </div>
                        {st.studentNameBn && st.studentNameEn && (
                          <div className="text-xs text-slate-500">{st.studentNameEn}</div>
                        )}
                      </td>
                      <td className="py-2 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {(
                            [
                              { code: 'P', label: t(lang, 'present'), activeCls: 'bg-emerald-700 text-white border-emerald-700' },
                              { code: 'A', label: t(lang, 'absent'), activeCls: 'bg-rose-600 text-white border-rose-600' },
                              { code: 'L', label: t(lang, 'late'), activeCls: 'bg-amber-600 text-white border-amber-600' },
                            ] as const
                          ).map((opt) => (
                            <button
                              key={opt.code}
                              type="button"
                              onClick={() =>
                                setStatuses((prev) => ({ ...prev, [st.id]: opt.code }))
                              }
                              className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                                current === opt.code
                                  ? opt.activeCls
                                  : 'bg-white text-slate-700 border-stone-300 hover:bg-stone-100'
                              }`}
                            >
                              {opt.code} · {opt.label}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                        <span className="text-emerald-700 font-semibold">P:{mStat.p}</span>
                        {' · '}
                        <span className="text-rose-600 font-semibold">A:{mStat.a}</span>
                        {' · '}
                        <span className="text-amber-600 font-semibold">L:{mStat.l}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {existingLog?.markedByName && (
        <p className="text-xs text-slate-500">
          {getClassLabel(selectedClass, lang)} · {lang === 'bn' ? 'সর্বশেষ হালনাগাদ:' : 'Last marked by'}{' '}
          <span className="font-medium text-slate-700">{existingLog.markedByName}</span>
        </p>
      )}
    </div>
  );
};
