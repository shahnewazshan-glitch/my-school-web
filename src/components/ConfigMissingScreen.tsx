import React, { useState } from 'react';
import { Check, Copy, Database, AlertTriangle } from 'lucide-react';
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_STORAGE_BUCKET,
  FIRESTORE_DATABASE_ID,
  type FirebaseEnvStatus,
} from '../lib/firebase';

export const ConfigMissingScreen: React.FC<{ envStatus: FirebaseEnvStatus }> = ({
  envStatus,
}) => {
  const [copied, setCopied] = useState(false);

  const envTemplate = `VITE_FIREBASE_API_KEY=your_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=${DEFAULT_PROJECT_ID}.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=${DEFAULT_PROJECT_ID}
VITE_FIREBASE_STORAGE_BUCKET=${DEFAULT_STORAGE_BUCKET}
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_web_app_id
VITE_FIREBASE_DATABASE_ID=${FIRESTORE_DATABASE_ID}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(envTemplate);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white border border-stone-200 rounded-xl p-8">
        <div className="flex items-start gap-4 pb-6 border-b border-stone-200">
          <div className="w-11 h-11 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Firebase Web Configuration Required
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              My School / আমার বিদ্যালয় connects directly to your existing Android app Firestore
              database. Configure the <code className="font-mono text-xs bg-stone-100 px-1.5 py-0.5 rounded">VITE_FIREBASE_*</code> environment variables to connect.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 mb-2">
              Missing Environment Variables
            </h2>
            <div className="flex flex-wrap gap-2 text-xs font-mono">
              {envStatus.missingVars.map((v) => (
                <span
                  key={v}
                  className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 text-xs text-slate-700 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <Database className="w-4 h-4 text-emerald-700" />
              <span>Target Android Database Connection</span>
            </div>
            <p>
              Project ID: <span className="font-mono">{DEFAULT_PROJECT_ID}</span>
            </p>
            <p>
              Storage Bucket: <span className="font-mono">{DEFAULT_STORAGE_BUCKET}</span>
            </p>
            <p className="break-all">
              Firestore Database ID: <span className="font-mono">{FIRESTORE_DATABASE_ID}</span>
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-800">
                Add to <code className="font-mono text-xs">.env.local</code> or Hosting Environment
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Template'}</span>
              </button>
            </div>
            <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
              {envTemplate}
            </pre>
          </div>

          <p className="text-xs text-slate-500">
            Find your Firebase Web SDK credentials in Firebase Console → Project Settings → Your apps → Web app, then restart the dev server or rebuild.
          </p>
        </div>
      </div>
    </div>
  );
};
