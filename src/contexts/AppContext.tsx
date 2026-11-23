import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  onSnapshotsInSync,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { getFirebaseInstances } from '../lib/firebase';
import { t, type Language } from '../lib/i18n';
import {
  compareRollNumbers,
  normalizeBdPhone,
  normalizeExamConfigs,
  normalizeSchoolId,
  sha256Hex,
} from '../lib/schoolUtils';
import {
  CLASS_LEVELS,
  type ActiveSession,
  type AttendanceLogDoc,
  type CustomFieldDoc,
  type MessageDoc,
  type ParentNoticeDoc,
  type PendingChangeDoc,
  type SchoolDoc,
  type StudentDoc,
  type SubjectDoc,
} from '../types/school';

const SESSION_STORAGE_KEY = 'myschool_companion_session_v1';
const LANG_STORAGE_KEY = 'myschool_companion_lang_v1';

interface AppContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  session: ActiveSession | null;
  school: SchoolDoc | null;
  students: StudentDoc[];
  subjects: SubjectDoc[];
  customFields: CustomFieldDoc[];
  pendingChanges: PendingChangeDoc[];
  parentNotices: ParentNoticeDoc[];
  messages: MessageDoc[];
  attendanceLogs: AttendanceLogDoc[];
  selectedAcademicYear: number;
  setSelectedAcademicYear: (yr: number) => void;
  selectedClass: string;
  setSelectedClass: (cls: string) => void;
  isOnline: boolean;
  hasPendingSync: boolean;
  dataLoading: boolean;
  authMessage: { type: 'error' | 'revoked'; text: string } | null;
  clearAuthMessage: () => void;
  login: (schoolIdRaw: string, phoneRaw: string, passwordPlain: string) => Promise<boolean>;
  logout: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function loadStoredSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveSession;
    if (parsed?.schoolId && parsed?.phoneNumber && parsed?.passwordHash) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      return saved === 'bn' ? 'bn' : 'en';
    } catch {
      return 'en';
    }
  });

  const [session, setSession] = useState<ActiveSession | null>(() => loadStoredSession());
  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [students, setStudents] = useState<StudentDoc[]>([]);
  const [subjects, setSubjects] = useState<SubjectDoc[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDoc[]>([]);
  const [pendingChanges, setPendingChanges] = useState<PendingChangeDoc[]>([]);
  const [parentNotices, setParentNotices] = useState<ParentNoticeDoc[]>([]);
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLogDoc[]>([]);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<number>(new Date().getFullYear());
  const [selectedClass, setSelectedClass] = useState<string>(CLASS_LEVELS[1]); // Class 1 default
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [hasPendingSync, setHasPendingSync] = useState<boolean>(false);
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  const [authMessage, setAuthMessage] = useState<{ type: 'error' | 'revoked'; text: string } | null>(
    null
  );

  const pendingFlagsRef = useRef<Record<string, boolean>>({});
  const yearInitializedRef = useRef<boolean>(false);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  }, []);

  const clearAuthMessage = useCallback(() => setAuthMessage(null), []);

  const clearSessionState = useCallback(() => {
    setSession(null);
    setSchool(null);
    setStudents([]);
    setSubjects([]);
    setCustomFields([]);
    setPendingChanges([]);
    setParentNotices([]);
    setMessages([]);
    setAttendanceLogs([]);
    yearInitializedRef.current = false;
    pendingFlagsRef.current = {};
    setHasPendingSync(false);
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const logout = useCallback(() => {
    clearSessionState();
    setAuthMessage(null);
  }, [clearSessionState]);

  const markPendingFlag = useCallback((key: string, pending: boolean) => {
    pendingFlagsRef.current[key] = pending;
    const anyPending = Object.values(pendingFlagsRef.current).some(Boolean);
    setHasPendingSync(anyPending);
  }, []);

  // Browser online/offline tracking
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Firestore snapshotsInSync tracking
  useEffect(() => {
    const instances = getFirebaseInstances();
    if (!instances) return;
    const unsub = onSnapshotsInSync(instances.db, () => {
      const anyPending = Object.values(pendingFlagsRef.current).some(Boolean);
      setHasPendingSync(anyPending);
    });
    return () => unsub();
  }, []);

  const login = useCallback(
    async (schoolIdRaw: string, phoneRaw: string, passwordPlain: string): Promise<boolean> => {
      const instances = getFirebaseInstances();
      if (!instances) return false;

      const schoolId = normalizeSchoolId(schoolIdRaw);
      const phone = normalizeBdPhone(phoneRaw);

      if (!schoolId || !phone || !passwordPlain) {
        setAuthMessage({ type: 'error', text: t(lang, 'accessDeniedUser') });
        return false;
      }

      try {
        const schoolRef = doc(instances.db, 'schools', schoolId);
        const snap = await getDoc(schoolRef);

        if (!snap.exists()) {
          setAuthMessage({ type: 'error', text: t(lang, 'accessDeniedSchoolNotFound') });
          return false;
        }

        const data = snap.data() as SchoolDoc;
        const teachers = Array.isArray(data.teachers) ? data.teachers : [];
        const matchedMember = teachers.find(
          (member) => normalizeBdPhone(member.phoneNumber || '') === phone
        );

        if (!matchedMember) {
          setAuthMessage({ type: 'error', text: t(lang, 'accessDeniedUser') });
          return false;
        }

        const computedHash = await sha256Hex(passwordPlain);
        if (
          !matchedMember.passwordHash ||
          matchedMember.passwordHash.trim() === '' ||
          computedHash !== matchedMember.passwordHash.toLowerCase()
        ) {
          setAuthMessage({ type: 'error', text: t(lang, 'accessDeniedPassword') });
          return false;
        }

        const nextSession: ActiveSession = {
          schoolId,
          phoneNumber: normalizeBdPhone(matchedMember.phoneNumber),
          deviceId: matchedMember.deviceId,
          name: matchedMember.name,
          role: matchedMember.role === 'ADMIN' ? 'ADMIN' : 'USER',
          passwordHash: matchedMember.passwordHash.toLowerCase(),
        };

        try {
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
        } catch {
          // ignore
        }

        setAuthMessage(null);
        setSession(nextSession);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setAuthMessage({ type: 'error', text: msg });
        return false;
      }
    },
    [lang]
  );

  // Real-time listeners + Live Session Enforcement when logged in
  useEffect(() => {
    const instances = getFirebaseInstances();
    if (!instances || !session) return;

    const { db } = instances;
    const schoolId = session.schoolId;
    setDataLoading(true);

    // 1. Real-time School Doc + Live Session Revocation Enforcement
    const unsubSchool = onSnapshot(
      doc(db, 'schools', schoolId),
      { includeMetadataChanges: true },
      (snap) => {
        markPendingFlag('school', snap.metadata.hasPendingWrites);

        if (!snap.exists()) {
          clearSessionState();
          setAuthMessage({ type: 'revoked', text: t(lang, 'accessRevoked') });
          setDataLoading(false);
          return;
        }

        const data = snap.data() as SchoolDoc;
        const teachers = Array.isArray(data.teachers) ? data.teachers : [];

        const activeMember = teachers.find(
          (member) => normalizeBdPhone(member.phoneNumber || '') === session.phoneNumber
        );

        // Instant Auto-Logout if removed or credentials invalidated
        if (
          !activeMember ||
          !activeMember.passwordHash ||
          activeMember.passwordHash.toLowerCase() !== session.passwordHash
        ) {
          clearSessionState();
          setAuthMessage({ type: 'revoked', text: t(lang, 'accessRevoked') });
          setDataLoading(false);
          return;
        }

        // Sync role/name updates seamlessly if changed by Admin
        const normalizedRole = activeMember.role === 'ADMIN' ? 'ADMIN' : 'USER';
        if (activeMember.name !== session.name || normalizedRole !== session.role) {
          const updatedSession: ActiveSession = {
            ...session,
            name: activeMember.name,
            role: normalizedRole,
          };
          setSession(updatedSession);
          try {
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updatedSession));
          } catch {
            // ignore
          }
        }

        const normalizedSchool: SchoolDoc = {
          ...data,
          schoolId: data.schoolId || schoolId,
          teachers,
          examConfigs: normalizeExamConfigs(data.examConfigs),
        };
        setSchool(normalizedSchool);

        if (!yearInitializedRef.current && normalizedSchool.defaultAcademicYear) {
          setSelectedAcademicYear(Number(normalizedSchool.defaultAcademicYear));
          yearInitializedRef.current = true;
        }
        setDataLoading(false);
      },
      (err) => {
        console.error('School snapshot error:', err);
        setDataLoading(false);
      }
    );

    // 2. Students
    const unsubStudents = onSnapshot(
      collection(db, 'schools', schoolId, 'students'),
      { includeMetadataChanges: true },
      (snap) => {
        markPendingFlag('students', snap.metadata.hasPendingWrites);
        const list: StudentDoc[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<StudentDoc, 'id'>),
          id: d.id,
        }));
        list.sort(compareRollNumbers);
        setStudents(list);
      }
    );

    // 3. Subjects
    const unsubSubjects = onSnapshot(
      collection(db, 'schools', schoolId, 'subjects'),
      { includeMetadataChanges: true },
      (snap) => {
        markPendingFlag('subjects', snap.metadata.hasPendingWrites);
        const list: SubjectDoc[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<SubjectDoc, 'id'>),
          id: d.id,
        }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setSubjects(list);
      }
    );

    // 4. Custom Fields
    const unsubCustomFields = onSnapshot(
      collection(db, 'schools', schoolId, 'customFields'),
      { includeMetadataChanges: true },
      (snap) => {
        markPendingFlag('customFields', snap.metadata.hasPendingWrites);
        const list: CustomFieldDoc[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<CustomFieldDoc, 'id'>),
          id: d.id,
        }));
        list.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
        setCustomFields(list);
      }
    );

    // 5. Pending Changes
    const unsubPending = onSnapshot(
      query(
        collection(db, 'schools', schoolId, 'pendingChanges'),
        orderBy('createdAt', 'desc')
      ),
      { includeMetadataChanges: true },
      (snap) => {
        markPendingFlag('pendingChanges', snap.metadata.hasPendingWrites);
        const list: PendingChangeDoc[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<PendingChangeDoc, 'id'>),
          id: d.id,
        }));
        setPendingChanges(list);
      }
    );

    // 6. Parent Notices
    const unsubNotices = onSnapshot(
      query(
        collection(db, 'schools', schoolId, 'parentNotices'),
        orderBy('createdAt', 'desc')
      ),
      { includeMetadataChanges: true },
      (snap) => {
        markPendingFlag('parentNotices', snap.metadata.hasPendingWrites);
        const list: ParentNoticeDoc[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<ParentNoticeDoc, 'id'>),
          id: d.id,
        }));
        setParentNotices(list);
      }
    );

    // 7. Teacher Chat Messages
    const unsubMessages = onSnapshot(
      query(
        collection(db, 'schools', schoolId, 'messages'),
        orderBy('createdAt', 'asc')
      ),
      { includeMetadataChanges: true },
      (snap) => {
        markPendingFlag('messages', snap.metadata.hasPendingWrites);
        const list: MessageDoc[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<MessageDoc, 'id'>),
          id: d.id,
        }));
        setMessages(list);
      }
    );

    return () => {
      unsubSchool();
      unsubStudents();
      unsubSubjects();
      unsubCustomFields();
      unsubPending();
      unsubNotices();
      unsubMessages();
    };
  }, [session?.schoolId, session?.phoneNumber, session?.deviceId, session?.passwordHash, clearSessionState, lang, markPendingFlag]);

  // 8. Attendance Logs scoped to selectedAcademicYear
  useEffect(() => {
    const instances = getFirebaseInstances();
    if (!instances || !session) return;

    const q = query(
      collection(instances.db, 'schools', session.schoolId, 'attendanceLogs'),
      where('academicYear', '==', selectedAcademicYear)
    );
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      markPendingFlag('attendanceLogs', snap.metadata.hasPendingWrites);
      const list: AttendanceLogDoc[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<AttendanceLogDoc, 'id'>),
        id: d.id,
      }));
      setAttendanceLogs(list);
    });
    return () => unsub();
  }, [session?.schoolId, selectedAcademicYear, markPendingFlag]);

  const value = useMemo<AppContextValue>(
    () => ({
      lang,
      setLang,
      session,
      school,
      students,
      subjects,
      customFields,
      pendingChanges,
      parentNotices,
      messages,
      attendanceLogs,
      selectedAcademicYear,
      setSelectedAcademicYear,
      selectedClass,
      setSelectedClass,
      isOnline,
      hasPendingSync,
      dataLoading,
      authMessage,
      clearAuthMessage,
      login,
      logout,
    }),
    [
      lang,
      setLang,
      session,
      school,
      students,
      subjects,
      customFields,
      pendingChanges,
      parentNotices,
      messages,
      attendanceLogs,
      selectedAcademicYear,
      selectedClass,
      isOnline,
      hasPendingSync,
      dataLoading,
      authMessage,
      clearAuthMessage,
      login,
      logout,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return ctx;
}
