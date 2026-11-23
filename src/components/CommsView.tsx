import React, { useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Bell, MessageSquare, Send } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { getFirebaseInstances } from '../lib/firebase';
import { buildParentNoticePayload } from '../lib/firestoreValidation';
import { getClassLabel, t } from '../lib/i18n';
import { formatTimestampDateTime } from '../lib/schoolUtils';
import { CLASS_LEVELS } from '../types/school';

export const CommsView: React.FC = () => {
  const {
    lang,
    session,
    school,
    parentNotices,
    messages,
    selectedAcademicYear,
    selectedClass,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'notices' | 'chat'>('notices');
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [noticeTargetClass, setNoticeTargetClass] = useState('ALL');
  const [postingNotice, setPostingNotice] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handlePublishNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !noticeTitle.trim() || !noticeMessage.trim()) return;
    const instances = getFirebaseInstances();
    if (!instances) return;

    setPostingNotice(true);
    setErrorText(null);
    try {
      const payload = buildParentNoticePayload({
        schoolId: session.schoolId,
        title: noticeTitle,
        message: noticeMessage,
        targetClass: noticeTargetClass,
        academicYear: selectedAcademicYear,
        sentByName: session.name,
        sentByRole: session.role,
      });

      await addDoc(
        collection(instances.db, 'schools', session.schoolId, 'parentNotices'),
        payload
      );
      setNoticeTitle('');
      setNoticeMessage('');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally {
      setPostingNotice(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !chatInput.trim()) return;
    const instances = getFirebaseInstances();
    if (!instances) return;

    const text = chatInput.trim();
    setSendingChat(true);
    setErrorText(null);

    try {
      const msgRef = await addDoc(
        collection(instances.db, 'schools', session.schoolId, 'messages'),
        {
          schoolId: session.schoolId,
          text,
          senderName: session.name,
          senderDeviceId: session.deviceId,
          senderPhone: session.phoneNumber,
          senderRole: session.role,
          createdAt: serverTimestamp(),
        }
      );

      // Update recentMessages (up to 30) on school document if permitted
      try {
        const existingRecent = Array.isArray(school?.recentMessages)
          ? school.recentMessages
          : [];
        const nextRecent = [
          ...existingRecent,
          {
            messageId: msgRef.id,
            senderName: session.name,
            senderRole: session.role,
            text,
            createdAtMs: Date.now(),
          },
        ].slice(-30);

        await updateDoc(doc(instances.db, 'schools', session.schoolId), {
          recentMessages: nextRecent,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Assistant teachers may not have write access to root school doc depending on rules; ignore silently
      }

      setChatInput('');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally {
      setSendingChat(false);
    }
  };

  return (
    <div className="space-y-5">
      {errorText && (
        <div className="px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-sm">
          {errorText}
        </div>
      )}

      {/* Segmented Tabs */}
      <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('notices')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'notices'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>{t(lang, 'parentNotices')}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'chat'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{t(lang, 'teacherChat')}</span>
        </button>
      </div>

      {activeTab === 'notices' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handlePublishNotice}
            className="lg:col-span-5 bg-white border border-stone-200 rounded-xl p-5 space-y-4 h-fit"
          >
            <h3 className="text-base font-semibold text-slate-900">
              {t(lang, 'postNotice')}
            </h3>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t(lang, 'targetClass')}
              </label>
              <select
                value={noticeTargetClass}
                onChange={(e) => setNoticeTargetClass(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg"
              >
                <option value="ALL">{t(lang, 'allClasses')}</option>
                {CLASS_LEVELS.map((cls) => (
                  <option key={cls} value={cls}>
                    {getClassLabel(cls, lang)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t(lang, 'noticeTitle')}
              </label>
              <input
                type="text"
                required
                value={noticeTitle}
                onChange={(e) => setNoticeTitle(e.target.value)}
                placeholder={selectedClass}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t(lang, 'noticeMessage')}
              </label>
              <textarea
                rows={4}
                required
                value={noticeMessage}
                onChange={(e) => setNoticeMessage(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <button
              type="submit"
              disabled={postingNotice}
              className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg cursor-pointer"
            >
              {postingNotice ? t(lang, 'loading') : t(lang, 'postNotice')}
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
            {parentNotices.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                {lang === 'bn' ? 'এখনো কোনো নোটিশ প্রকাশিত হয়নি।' : 'No parent notices published yet.'}
              </div>
            ) : (
              parentNotices.map((n) => (
                <article key={n.id} className="p-5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-base font-semibold text-slate-900">{n.title}</h4>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {formatTimestampDateTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.message}</p>
                  <div className="text-xs text-slate-500 flex items-center gap-2 pt-1">
                    <span>
                      {n.targetClass === 'ALL' || !n.targetClass
                        ? t(lang, 'allClasses')
                        : getClassLabel(n.targetClass, lang)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{n.sentByName}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl flex flex-col h-[68vh]">
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">
                {lang === 'bn'
                  ? 'এখনো কোনো বার্তা নেই। শিক্ষকদের সাথে কথোপকথন শুরু করুন।'
                  : 'No messages yet. Start a conversation with your school teachers.'}
              </div>
            ) : (
              messages.map((m) => {
                const isMine =
                  (m.senderDeviceId && m.senderDeviceId === session?.deviceId) ||
                  m.senderName === session?.name;
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[80%] sm:max-w-md rounded-xl px-4 py-2.5 text-sm ${
                        isMine
                          ? 'bg-emerald-700 text-white'
                          : 'bg-stone-100 text-slate-900 border border-stone-200'
                      }`}
                    >
                      {!isMine && (
                        <div className="text-xs font-semibold text-emerald-800 mb-0.5">
                          {m.senderName}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 px-1 tabular-nums">
                      {formatTimestampDateTime(m.createdAt)}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={handleSendChat}
            className="p-3 border-t border-stone-200 flex items-center gap-2 bg-stone-50"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={t(lang, 'typeMessage')}
              className="flex-1 px-3.5 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            <button
              type="submit"
              disabled={sendingChat || !chatInput.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg cursor-pointer whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{t(lang, 'sendMessage')}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
