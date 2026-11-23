import React, { useState } from 'react';
import { Eye, EyeOff, Globe, Lock, ShieldAlert, GraduationCap } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import { normalizeBdPhone, normalizeSchoolId } from '../lib/schoolUtils';

export const LoginScreen: React.FC = () => {
  const { lang, setLang, login, authMessage, clearAuthMessage } = useApp();
  const [schoolIdRaw, setSchoolIdRaw] = useState('');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const normalizedId = normalizeSchoolId(schoolIdRaw);
  const normalizedPhone = normalizeBdPhone(phoneRaw);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthMessage();
    setSubmitting(true);
    try {
      await login(schoolIdRaw, phoneRaw, password);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col justify-between p-4 sm:p-8">
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-slate-900">
          <div className="w-9 h-9 rounded-lg bg-emerald-700 text-white flex items-center justify-center">
            <GraduationCap className="w-5 h-5" />
          </div>
          <span className="text-base font-semibold tracking-tight whitespace-nowrap">
            {t(lang, 'loginTitle')}
          </span>
        </div>

        <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              lang === 'en'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLang('bn')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              lang === 'bn'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            বাংলা
          </button>
        </div>
      </div>

      <main className="max-w-5xl w-full mx-auto my-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-6 space-y-5">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight text-balance leading-tight">
            {lang === 'bn'
              ? 'বিদ্যালয় ব্যবস্থাপনার রিয়েল-টাইম ওয়েব সঙ্গী'
              : 'Real-Time Academic Workspace Synced With Your Android App'}
          </h1>
          <p className="text-base text-slate-600 leading-relaxed max-w-xl">
            {t(lang, 'loginSubtitle')}
          </p>

          <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              <div className="text-sm text-slate-700 leading-relaxed">
                {t(lang, 'loginRestrictedNotice')}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 pt-2 border-t border-stone-100">
              <Globe className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                {lang === 'bn'
                  ? 'অফলাইন ক্যাশ সাপোর্ট · ৩-সাময়িকী মার্কশিট · এক্সেল ও PDF এক্সপোর্ট'
                  : 'Offline IndexedDB Cache · 3-Term Marksheet · Excel & Print Exports'}
              </span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6">
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-stone-200 rounded-xl p-6 sm:p-8 space-y-5"
          >
            <div className="pb-4 border-b border-stone-100">
              <h2 className="text-xl font-semibold text-slate-900">
                {lang === 'bn' ? 'শিক্ষক ও অ্যাডমিন লগইন' : 'Teacher & Admin Sign In'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {lang === 'bn'
                  ? 'অ্যান্ড্রয়েড অ্যাপের স্কুল আইডি, মোবাইল নম্বর ও পাসওয়ার্ড ব্যবহার করুন'
                  : 'Enter your School ID, registered mobile number, and app password'}
              </p>
            </div>

            {authMessage && (
              <div
                role="alert"
                className="flex items-start gap-3 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm"
              >
                <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
                <span>{authMessage.text}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="school-id-input"
                className="block text-sm font-medium text-slate-700"
              >
                {t(lang, 'schoolIdLabel')}
              </label>
              <input
                id="school-id-input"
                type="text"
                required
                autoComplete="organization"
                value={schoolIdRaw}
                onChange={(e) => setSchoolIdRaw(e.target.value)}
                placeholder={t(lang, 'schoolIdPlaceholder')}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 font-mono uppercase"
              />
              {schoolIdRaw.trim() !== '' && (
                <p className="text-xs text-slate-500 font-mono">
                  Normalized ID: {normalizedId || '-'}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="phone-input"
                className="block text-sm font-medium text-slate-700"
              >
                {t(lang, 'phoneLabel')}
              </label>
              <input
                id="phone-input"
                type="tel"
                required
                autoComplete="tel"
                value={phoneRaw}
                onChange={(e) => setPhoneRaw(e.target.value)}
                placeholder={t(lang, 'phonePlaceholder')}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 font-mono tabular-nums"
              />
              {phoneRaw.trim() !== '' && (
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  Normalized Phone: {normalizedPhone || '-'}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password-input"
                className="block text-sm font-medium text-slate-700"
              >
                {t(lang, 'passwordLabel')}
              </label>
              <div className="relative">
                <input
                  id="password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t(lang, 'passwordPlaceholder')}
                  className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {submitting ? t(lang, 'signingIn') : t(lang, 'signInBtn')}
            </button>
          </form>
        </div>
      </main>

      <footer className="max-w-5xl w-full mx-auto text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-stone-200">
        <span>My School / আমার বিদ্যালয়</span>
        <span>Android App Companion · Real-time Firestore Sync</span>
      </footer>
    </div>
  );
};
