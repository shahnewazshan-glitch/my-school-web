import { serverTimestamp } from 'firebase/firestore';
import type {
  AttendanceStatus,
  CustomFieldDoc,
  ExamConfig,
  ParentNoticeDoc,
  PendingChangeDoc,
  StudentDoc,
  SubjectDoc,
} from '../types/school';

export const FIRESTORE_LIMITS = {
  PHOTO_BASE64_MAX_CHARS: 140000,
  EXAM_RESULTS_MAX_KEYS: 350,
  CUSTOM_VALUES_MAX_KEYS: 100,
  SUBJECT_VALUES_MAX_KEYS: 150,
} as const;

export function validateAndBuildStudentPayload(
  input: Partial<StudentDoc>,
  schoolId: string,
  updatedByName: string,
  existingCreatedAt?: unknown
): Record<string, unknown> {
  const photoBase64 = (input.photoBase64 || '').trim();
  if (photoBase64.length > FIRESTORE_LIMITS.PHOTO_BASE64_MAX_CHARS) {
    throw new Error(
      `Student photo exceeds Firestore limit (${photoBase64.length} > ${FIRESTORE_LIMITS.PHOTO_BASE64_MAX_CHARS} chars).`
    );
  }

  const examResults = sanitizeRecordMap(input.examResults || {});
  if (Object.keys(examResults).length > FIRESTORE_LIMITS.EXAM_RESULTS_MAX_KEYS) {
    throw new Error(
      `Exam results exceed maximum ${FIRESTORE_LIMITS.EXAM_RESULTS_MAX_KEYS} entries.`
    );
  }

  const customValues = sanitizeRecordMap(input.customValues || {});
  if (Object.keys(customValues).length > FIRESTORE_LIMITS.CUSTOM_VALUES_MAX_KEYS) {
    throw new Error(
      `Custom field values exceed maximum ${FIRESTORE_LIMITS.CUSTOM_VALUES_MAX_KEYS} entries.`
    );
  }

  const subjectValues = sanitizeRecordMap(input.subjectValues || {});
  if (Object.keys(subjectValues).length > FIRESTORE_LIMITS.SUBJECT_VALUES_MAX_KEYS) {
    throw new Error(
      `Subject field values exceed maximum ${FIRESTORE_LIMITS.SUBJECT_VALUES_MAX_KEYS} entries.`
    );
  }

  return {
    schoolId,
    studentNameBn: String(input.studentNameBn || '').trim(),
    studentNameEn: String(input.studentNameEn || '').trim(),
    fatherNameEn: String(input.fatherNameEn || '').trim(),
    motherNameEn: String(input.motherNameEn || '').trim(),
    dateOfBirth: String(input.dateOfBirth || '').trim(),
    guardianPhone: String(input.guardianPhone || '').trim(),
    address: String(input.address || '').trim(),
    photoBase64,
    rollNumber: String(input.rollNumber ?? '').trim(),
    nextYearRollNumber: String(input.nextYearRollNumber ?? '').trim(),
    classLevel: String(input.classLevel || 'Class 1').trim(),
    section: String(input.section || '').trim(),
    academicYear: Number(input.academicYear) || new Date().getFullYear(),
    totalSchoolDays: Number(input.totalSchoolDays) || 0,
    daysPresent: Number(input.daysPresent) || 0,
    promotionStatus: String(input.promotionStatus || '').trim(),
    customValues,
    subjectValues,
    examResults,
    sectorNotes: String(input.sectorNotes || '').trim(),
    lastUpdatedByName: updatedByName,
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function sanitizeRecordMap<T extends string | number | boolean>(
  map: Record<string, T | null | undefined>
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(map)) {
    if (v !== undefined && v !== null && v !== '') {
      out[k] = v;
    }
  }
  return out;
}

export function buildSubjectPayload(
  input: Partial<SubjectDoc>,
  schoolId: string,
  existingCreatedAt?: unknown
): Record<string, unknown> {
  return {
    schoolId,
    name: String(input.name || '').trim(),
    gradeScope: String(input.gradeScope || 'ALL').trim(),
    fields: (input.fields || []).map((f) => ({
      fieldId: String(f.fieldId || '').trim(),
      label: String(f.label || '').trim(),
      fieldType: f.fieldType || 'TEXT',
      maxMarks: Number(f.maxMarks) || 0,
    })),
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function buildCustomFieldPayload(
  input: Partial<CustomFieldDoc>,
  schoolId: string,
  existingCreatedAt?: unknown
): Record<string, unknown> {
  return {
    schoolId,
    category: String(input.category || 'General').trim(),
    label: String(input.label || '').trim(),
    fieldType: input.fieldType || 'TEXT',
    resetsYearly: Boolean(input.resetsYearly),
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function buildAttendancePayload(params: {
  schoolId: string;
  academicYear: number;
  classLevel: string;
  dateKey: string;
  statuses: Record<string, AttendanceStatus>;
  markedByName: string;
  existingCreatedAt?: unknown;
}): Record<string, unknown> {
  return {
    schoolId: params.schoolId,
    academicYear: Number(params.academicYear),
    classLevel: params.classLevel,
    dateKey: params.dateKey,
    monthKey: params.dateKey.slice(0, 7),
    statuses: params.statuses,
    markedByName: params.markedByName,
    createdAt: params.existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function buildPendingChangePayload(
  input: Omit<PendingChangeDoc, 'id' | 'createdAt' | 'updatedAt'>
): Record<string, unknown> {
  return {
    schoolId: input.schoolId,
    entityType: input.entityType,
    targetId: input.targetId,
    submittedByDeviceId: input.submittedByDeviceId,
    submittedByName: input.submittedByName,
    summary: input.summary,
    detailsText: input.detailsText,
    payloadJson: input.payloadJson,
    status: input.status || 'PENDING',
    reviewedByName: input.reviewedByName || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function buildParentNoticePayload(
  input: Omit<ParentNoticeDoc, 'id' | 'createdAt' | 'updatedAt'>
): Record<string, unknown> {
  return {
    schoolId: input.schoolId,
    title: String(input.title || '').trim(),
    message: String(input.message || '').trim(),
    targetClass: String(input.targetClass || 'ALL').trim(),
    academicYear: Number(input.academicYear) || new Date().getFullYear(),
    sentByName: input.sentByName,
    sentByRole: input.sentByRole || 'USER',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function sanitizeExamConfigs(configs: ExamConfig[]): ExamConfig[] {
  return configs.map((c) => ({
    examId: String(c.examId),
    title: String(c.title || '').trim(),
    subjects: (c.subjects || []).map((s) => ({
      subjectId: String(s.subjectId || '').trim(),
      subjectName: String(s.subjectName || '').trim(),
      classScope: String(s.classScope || 'ALL').trim(),
      fullMarks: Math.max(1, Number(s.fullMarks) || 100),
      passMarks: Math.max(0, Number(s.passMarks) || 33),
      highestMarkOverride:
        s.highestMarkOverride !== undefined &&
        s.highestMarkOverride !== null &&
        String(s.highestMarkOverride) !== ''
          ? Number(s.highestMarkOverride)
          : null,
    })),
  }));
}
