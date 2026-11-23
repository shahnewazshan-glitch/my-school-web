import type {
  ExamConfig,
  ExamSubjectConfig,
  ExamTermId,
  StudentDoc,
} from '../types/school';

export const TERM_ORDER: ExamTermId[] = ['exam_1', 'exam_2', 'exam_3'];

export const DEFAULT_EXAM_TITLES: Record<ExamTermId, string> = {
  exam_1: '1st Term Exam',
  exam_2: '2nd Term Exam',
  exam_3: 'Final / Annual Exam',
};

/**
 * Exact Android School ID normalization:
 * raw.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 32)
 */
export function normalizeSchoolId(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 32);
}

/**
 * Exact Android Bangladesh phone number normalization:
 * - Strip all characters except digits and '+'
 * - If starts with '01' and length === 11 -> prefix '+88' (becomes '+8801XXXXXXXXX')
 * - If starts with '880' and length === 13 -> prefix '+'
 * - Otherwise keep digits/plus as-is
 */
export function normalizeBdPhone(raw: string): string {
  const cleaned = raw.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    return `+88${cleaned}`;
  }
  if (cleaned.startsWith('880') && cleaned.length === 13) {
    return `+${cleaned}`;
  }
  return cleaned;
}

/**
 * Client-side SHA-256 hex digest (lowercase 64 chars) via Web Crypto API.
 */
export async function sha256Hex(plainText: string): Promise<string> {
  const bytes = new TextEncoder().encode(plainText);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Format photoBase64 for HTML <img> src, supporting both raw base64 (Android) and data URLs.
 */
export function formatPhotoSrc(photoBase64?: string | null): string | null {
  if (!photoBase64 || !photoBase64.trim()) return null;
  const trimmed = photoBase64.trim();
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  return `data:image/jpeg;base64,${trimmed}`;
}

/**
 * Compress uploaded image file using HTML5 canvas so raw Base64 stays strictly under 100KB
 * (well within Firestore rule limit of 140,000 chars).
 */
export async function compressImageToBase64(
  file: File,
  maxBase64Length = 98000
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Invalid image file'));
    image.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  let maxDim = 360;
  let quality = 0.82;

  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const outDataUrl = canvas.toDataURL('image/jpeg', quality);
    const rawBase64 = outDataUrl.replace(/^data:image\/jpeg;base64,/, '');
    if (rawBase64.length <= maxBase64Length) {
      return rawBase64;
    }

    quality = Math.max(0.35, quality - 0.12);
    if (attempt >= 3) {
      maxDim = Math.max(160, Math.round(maxDim * 0.78));
    }
  }

  throw new Error('Image is still too large after compression. Please choose a smaller photo.');
}

/**
 * Class scope matcher for examConfigs & subjects.
 * Supports 'ALL', '', exact match ('Class 1'), or comma-separated list ('Class 1, Class 2').
 */
export function matchesClassScope(scope: string | undefined, classLevel: string): boolean {
  if (!scope || !scope.trim()) return true;
  const normalizedTarget = classLevel.trim().toLowerCase();
  const tokens = scope
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0 || tokens.includes('all') || tokens.includes('all classes')) {
    return true;
  }
  return tokens.includes(normalizedTarget);
}

/**
 * Build canonical examConfigs ensuring 3 terms always exist (exam_1, exam_2, exam_3).
 */
export function normalizeExamConfigs(rawConfigs?: ExamConfig[]): ExamConfig[] {
  const existing = rawConfigs || [];
  return TERM_ORDER.map((examId) => {
    const found = existing.find((c) => c.examId === examId);
    return {
      examId,
      title: found?.title || DEFAULT_EXAM_TITLES[examId],
      subjects: Array.isArray(found?.subjects) ? found.subjects : [],
    };
  });
}

/**
 * Merge unique subjects across the 3 examConfigs for a given classLevel.
 */
export function getClassSubjectsForMarksheet(
  examConfigs: ExamConfig[],
  classLevel: string
): ExamSubjectConfig[] {
  const byId = new Map<string, ExamSubjectConfig>();
  const normalized = normalizeExamConfigs(examConfigs);
  for (const exam of normalized) {
    for (const subj of exam.subjects) {
      if (matchesClassScope(subj.classScope, classLevel)) {
        if (!byId.has(subj.subjectId)) {
          byId.set(subj.subjectId, subj);
        }
      }
    }
  }
  return Array.from(byId.values());
}

/**
 * Internal Bangladesh pass mark calculation (NOT shown as a table column).
 */
export function getInternalPassMarks(fullMarks: number): number {
  if (fullMarks === 100) return 33;
  if (fullMarks === 50) return 17;
  return Math.ceil(fullMarks * 0.33);
}

export interface GradeResult {
  grade: string;
  gpa: number;
  passed: boolean;
}

/**
 * Bangladesh grading calculation (internal).
 */
export function calculateSubjectGrade(obtained: number, fullMarks: number): GradeResult {
  if (fullMarks <= 0) {
    return { grade: '-', gpa: 0, passed: true };
  }
  const passMarks = getInternalPassMarks(fullMarks);
  if (obtained < passMarks) {
    return { grade: 'F', gpa: 0.0, passed: false };
  }
  const pct = (obtained / fullMarks) * 100;
  if (pct >= 80) return { grade: 'A+', gpa: 5.0, passed: true };
  if (pct >= 70) return { grade: 'A', gpa: 4.0, passed: true };
  if (pct >= 60) return { grade: 'A-', gpa: 3.5, passed: true };
  if (pct >= 50) return { grade: 'B', gpa: 3.0, passed: true };
  if (pct >= 40) return { grade: 'C', gpa: 2.0, passed: true };
  return { grade: 'D', gpa: 1.0, passed: true };
}

export function gpaToLetterGrade(gpa: number, passed: boolean): string {
  if (!passed) return 'F';
  if (gpa >= 5.0) return 'A+';
  if (gpa >= 4.0) return 'A';
  if (gpa >= 3.5) return 'A-';
  if (gpa >= 3.0) return 'B';
  if (gpa >= 2.0) return 'C';
  if (gpa >= 1.0) return 'D';
  return 'F';
}

export function readNumericMark(
  examResults: Record<string, number | string> | undefined,
  key: string
): number | null {
  if (!examResults) return null;
  const val = examResults[key];
  if (val === undefined || val === null || val === '') return null;
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : null;
}

export interface TermSubjectScore {
  cont: number | null;
  sum: number | null;
  total: number | null;
  hasScore: boolean;
}

export function getTermSubjectScore(
  examResults: Record<string, number | string> | undefined,
  examId: string,
  subjectId: string
): TermSubjectScore {
  const cont = readNumericMark(examResults, `${examId}__${subjectId}__cont`);
  const sum = readNumericMark(examResults, `${examId}__${subjectId}__sum`);
  const storedTotal = readNumericMark(examResults, `${examId}__${subjectId}`);

  if (cont !== null || sum !== null) {
    const total = (cont ?? 0) + (sum ?? 0);
    return { cont, sum, total, hasScore: true };
  }
  if (storedTotal !== null) {
    return { cont: null, sum: null, total: storedTotal, hasScore: true };
  }
  return { cont: null, sum: null, total: null, hasScore: false };
}

export interface StudentTermSummary {
  totalFullMarks: number;
  totalObtained: number;
  gpa: number;
  grade: string;
  passed: boolean;
  scoredSubjects: number;
}

export function computeStudentTermSummary(
  student: StudentDoc,
  subjects: ExamSubjectConfig[],
  examId: ExamTermId
): StudentTermSummary {
  let totalFullMarks = 0;
  let totalObtained = 0;
  let gpaSum = 0;
  let scoredSubjects = 0;
  let allPassed = true;

  for (const subj of subjects) {
    const score = getTermSubjectScore(student.examResults, examId, subj.subjectId);
    if (score.hasScore && score.total !== null) {
      totalFullMarks += subj.fullMarks;
      totalObtained += score.total;
      const g = calculateSubjectGrade(score.total, subj.fullMarks);
      if (!g.passed) allPassed = false;
      gpaSum += g.gpa;
      scoredSubjects += 1;
    }
  }

  if (scoredSubjects === 0) {
    return {
      totalFullMarks: 0,
      totalObtained: 0,
      gpa: 0,
      grade: '-',
      passed: false,
      scoredSubjects: 0,
    };
  }

  const gpa = allPassed ? Number((gpaSum / scoredSubjects).toFixed(2)) : 0.0;
  const grade = gpaToLetterGrade(gpa, allPassed);
  return {
    totalFullMarks,
    totalObtained,
    gpa,
    grade,
    passed: allPassed,
    scoredSubjects,
  };
}

/**
 * Compute Final/Annual Exam (exam_3) Merit Rank strictly for passers.
 * Returns Map<studentId, rankNumber (1-based)>.
 */
export function computeFinalExamMeritMap(
  students: StudentDoc[],
  subjects: ExamSubjectConfig[]
): Map<string, number> {
  const passers: Array<{
    studentId: string;
    totalObtained: number;
    gpa: number;
    rollNum: number;
  }> = [];

  for (const st of students) {
    const summary = computeStudentTermSummary(st, subjects, 'exam_3');
    if (summary.scoredSubjects > 0 && summary.passed) {
      const rollNum = Number(st.rollNumber) || 999999;
      passers.push({
        studentId: st.id,
        totalObtained: summary.totalObtained,
        gpa: summary.gpa,
        rollNum,
      });
    }
  }

  passers.sort((a, b) => {
    if (b.totalObtained !== a.totalObtained) return b.totalObtained - a.totalObtained;
    if (b.gpa !== a.gpa) return b.gpa - a.gpa;
    return a.rollNum - b.rollNum;
  });

  const meritMap = new Map<string, number>();
  passers.forEach((p, idx) => {
    meritMap.set(p.studentId, idx + 1);
  });
  return meritMap;
}

export function getTodayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getAttendanceDocId(
  academicYear: number,
  classLevel: string,
  dateKey: string
): string {
  const classSafe = classLevel.replace(/[^a-zA-Z0-9]/g, '_');
  return `${academicYear}_${classSafe}_${dateKey}`;
}

export function compareRollNumbers(a: StudentDoc, b: StudentDoc): number {
  const na = Number(a.rollNumber);
  const nb = Number(b.rollNumber);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) {
    return na - nb;
  }
  return String(a.rollNumber || '').localeCompare(String(b.rollNumber || ''), undefined, {
    numeric: true,
  });
}

export function formatTimestampMs(ts: unknown): string {
  if (!ts) return '-';
  let ms = 0;
  if (typeof ts === 'number') {
    ms = ts;
  } else if (typeof ts === 'object' && ts !== null && 'toMillis' in ts) {
    ms = (ts as { toMillis: () => number }).toMillis();
  } else if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    ms = Number((ts as { seconds: number }).seconds) * 1000;
  }
  if (!ms) return '-';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTimestampDateTime(ts: unknown): string {
  if (!ts) return '-';
  let ms = 0;
  if (typeof ts === 'number') {
    ms = ts;
  } else if (typeof ts === 'object' && ts !== null && 'toMillis' in ts) {
    ms = (ts as { toMillis: () => number }).toMillis();
  } else if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    ms = Number((ts as { seconds: number }).seconds) * 1000;
  }
  if (!ms) return '-';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function isValidHttpUrl(raw: string): boolean {
  if (!raw || !raw.trim()) return false;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
