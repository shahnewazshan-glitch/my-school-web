import type { Timestamp } from 'firebase/firestore';

export const CLASS_LEVELS = [
  'Pre-Primary',
  'Class 1',
  'Class 2',
  'Class 3',
  'Class 4',
  'Class 5',
] as const;

export type ClassLevel = (typeof CLASS_LEVELS)[number];

export type TeacherRole = 'ADMIN' | 'USER';

export type ExamTermId = 'exam_1' | 'exam_2' | 'exam_3';

export type AttendanceStatus = 'P' | 'A' | 'L';

export type CustomFieldType = 'TEXT' | 'NUMBER' | 'YES_NO';

export type PendingEntityType =
  | 'STUDENT_CREATE'
  | 'STUDENT_UPDATE'
  | 'STUDENT_DELETE'
  | 'STUDENT_BATCH_UPDATE'
  | 'SUBJECT_SAVE'
  | 'SUBJECT_DELETE'
  | 'CUSTOM_FIELD_SAVE'
  | 'CUSTOM_FIELD_DELETE'
  | 'ATTENDANCE_SAVE'
  | 'EXAM_CONFIG_SAVE';

export type PendingStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface TeacherMember {
  deviceId: string;
  name: string;
  phoneNumber: string;
  passwordHash: string;
  role: TeacherRole;
  joinedAtMs: number;
}

export interface ExamSubjectConfig {
  subjectId: string;
  subjectName: string;
  classScope: string; // e.g. 'ALL' or 'Class 1' or comma-separated
  fullMarks: number;
  passMarks: number;
  highestMarkOverride?: number | null;
}

export interface ExamConfig {
  examId: ExamTermId | string;
  title: string;
  subjects: ExamSubjectConfig[];
}

export interface RecentMessageSummary {
  messageId?: string;
  senderName: string;
  senderRole?: string;
  text: string;
  createdAtMs?: number;
}

export interface SchoolDoc {
  schoolId: string;
  schoolName: string;
  emisCode?: string;
  upazilaDistrict?: string;
  defaultAcademicYear: number;
  lastAutoRolloverYear?: number;
  teachersPanelVersion?: number;
  adminDeviceId?: string;
  adminName?: string;
  teachers: TeacherMember[];
  examConfigs: ExamConfig[];
  recentMessages?: RecentMessageSummary[];
  latestAppVersionCode?: number;
  latestAppVersionName?: string;
  appUpdateUrl?: string;
  appUpdateNotes?: string;
  createdAt?: Timestamp | unknown;
  updatedAt?: Timestamp | unknown;
}

export interface StudentDoc {
  id: string;
  schoolId: string;
  studentNameBn: string;
  studentNameEn: string;
  fatherNameEn?: string;
  motherNameEn?: string;
  dateOfBirth?: string;
  guardianPhone?: string;
  address?: string;
  photoBase64?: string;
  rollNumber: string | number;
  nextYearRollNumber?: string | number;
  classLevel: string;
  section?: string;
  academicYear: number;
  totalSchoolDays?: number;
  daysPresent?: number;
  promotionStatus?: string;
  customValues?: Record<string, string | number | boolean>;
  subjectValues?: Record<string, string | number | boolean>;
  examResults?: Record<string, number | string>;
  sectorNotes?: string;
  lastUpdatedByName?: string;
  createdAt?: Timestamp | unknown;
  updatedAt?: Timestamp | unknown;
}

export interface SubjectField {
  fieldId: string;
  label: string;
  fieldType: CustomFieldType;
  maxMarks?: number;
}

export interface SubjectDoc {
  id: string;
  schoolId: string;
  name: string;
  gradeScope: string; // e.g. 'ALL' or 'Class 1,Class 2'
  fields: SubjectField[];
  createdAt?: Timestamp | unknown;
  updatedAt?: Timestamp | unknown;
}

export interface CustomFieldDoc {
  id: string;
  schoolId: string;
  category: string;
  label: string;
  fieldType: CustomFieldType;
  resetsYearly: boolean;
  createdAt?: Timestamp | unknown;
  updatedAt?: Timestamp | unknown;
}

export interface AttendanceLogDoc {
  id: string;
  schoolId: string;
  academicYear: number;
  classLevel: string;
  dateKey: string; // YYYY-MM-DD
  monthKey: string; // YYYY-MM
  statuses: Record<string, AttendanceStatus>;
  markedByName: string;
  createdAt?: Timestamp | unknown;
  updatedAt?: Timestamp | unknown;
}

export interface PendingChangeDoc {
  id: string;
  schoolId: string;
  entityType: PendingEntityType;
  targetId: string;
  submittedByDeviceId: string;
  submittedByName: string;
  summary: string;
  detailsText: string;
  payloadJson: string;
  status: PendingStatus;
  reviewedByName?: string;
  createdAt?: Timestamp | unknown;
  updatedAt?: Timestamp | unknown;
}

export interface ParentNoticeDoc {
  id: string;
  schoolId: string;
  title: string;
  message: string;
  targetClass?: string;
  academicYear?: number;
  sentByName: string;
  sentByRole?: string;
  createdAt?: Timestamp | unknown;
  updatedAt?: Timestamp | unknown;
}

export interface MessageDoc {
  id: string;
  schoolId: string;
  text: string;
  senderName: string;
  senderDeviceId?: string;
  senderPhone?: string;
  senderRole?: TeacherRole;
  createdAt?: Timestamp | unknown;
}

export interface ActiveSession {
  schoolId: string;
  phoneNumber: string;
  deviceId: string;
  name: string;
  role: TeacherRole;
  passwordHash: string;
}
