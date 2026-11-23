# My School / আমার বিদ্যালয় — Web Companion

A bilingual (**English + বাংলা**) School Management Companion Web Application built with React, TypeScript, Vite, Tailwind CSS, and Firebase Web SDK (v10+). Connects directly to the **My School Android app** Firestore database (`ai-studio-android-shikkhak-d7cf47c5-f493-43a9-a72b-7dac0283910a`) under project `gen-lang-client-0998631791`.

---

## Key Capabilities

- **Strict App-Only Access**: Only existing teachers already registered in `schools/{schoolId}.teachers` via the My School Android app can sign in (using School ID, normalized Bangladesh phone number, and SHA-256 verified password).
- **Live Session Enforcement**: Real-time `onSnapshot` listener immediately signs out any user removed from `teachers` by the School Admin.
- **Role-Based Authority**:
  - **Admin (`ADMIN`)**: Direct student/mark/attendance/subject/custom-field edits, Approve/Reject teacher `pendingChanges`, remove teacher access with Admin password verification, configure 3-term `examConfigs`, and publish Android app updates.
  - **Assistant Teacher (`USER`)**: View school records, mark daily attendance, and submit student/mark/field updates to `pendingChanges` for Admin approval.
- **3-Term Marksheet & Exports**: Continuous + Summative mark entry across 1st Term, 2nd Term, and Final/Annual Exam with instant Totals, 3-Term Average, internal Bangladesh GPA/Grade & Final Exam Merit Rank, Print/PDF cards, and `.xlsx` / `.csv` import & export.
- **Offline Persistence**: Browser IndexedDB cache (`persistentLocalCache`) with live Online / Offline & Pending Sync indicator.

---

## 1. Environment Setup

Create a `.env.local` file (or configure environment variables in your hosting provider) using `.env.example`:

```env
VITE_FIREBASE_API_KEY=your_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=gen-lang-client-0998631791.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=gen-lang-client-0998631791
VITE_FIREBASE_STORAGE_BUCKET=gen-lang-client-0998631791.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_web_app_id
VITE_FIREBASE_DATABASE_ID=ai-studio-android-shikkhak-d7cf47c5-f493-43a9-a72b-7dac0283910a
```

Run locally:

```bash
npm install
npm run dev
```

Build production bundle:

```bash
npm run build
```

---

## 2. Free Static Deployment Options

### Option A: Firebase Hosting (Spark Free Plan)

1. Install Firebase CLI (if not installed):
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
2. Build the static `dist/` folder:
   ```bash
   npm run build
   ```
3. Deploy to Firebase Hosting (uses included `firebase.json`):
   ```bash
   firebase deploy --only hosting --project gen-lang-client-0998631791
   ```

### Option B: Vercel (Free Hobby Plan)

1. Push repository to GitHub/GitLab or install Vercel CLI (`npm i -g vercel`).
2. Add the `VITE_FIREBASE_*` environment variables in Vercel Project Settings -> Environment Variables.
3. Build command: `npm run build` · Output directory: `dist`.
4. Add a `vercel.json` rewrite or use SPA fallback (`/* -> /index.html`).

### Option C: Cloudflare Pages (Free Plan)

1. Connect your repository in Cloudflare Dashboard -> Workers & Pages -> Create application -> Pages.
2. Build command: `npm run build` · Build output directory: `dist`.
3. Add all `VITE_FIREBASE_*` environment variables under Settings -> Environment Variables (Production & Preview).
