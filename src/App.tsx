/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AdminPanelView } from './components/AdminPanelView';
import { AttendanceView } from './components/AttendanceView';
import { BatchFieldsView } from './components/BatchFieldsView';
import { BatchMarksView } from './components/BatchMarksView';
import { CommsView } from './components/CommsView';
import { ConfigMissingScreen } from './components/ConfigMissingScreen';
import { DashboardView } from './components/DashboardView';
import { LoginScreen } from './components/LoginScreen';
import { MarksheetView } from './components/MarksheetView';
import { StudentsView } from './components/StudentsView';
import { WorkspaceLayout, type NavTab } from './components/WorkspaceLayout';
import { AppProvider, useApp } from './contexts/AppContext';
import { getFirebaseEnvStatus } from './lib/firebase';

const MainAppShell: React.FC = () => {
  const { session, dataLoading } = useApp();
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');

  // Ensure non-Admin users never remain on Admin tab if role downgrades live
  useEffect(() => {
    if (session?.role !== 'ADMIN' && activeTab === 'admin') {
      setActiveTab('dashboard');
    }
  }, [session?.role, activeTab]);

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <WorkspaceLayout activeTab={activeTab} onSelectTab={setActiveTab}>
      {dataLoading && (
        <div className="mb-4 px-4 py-2.5 bg-white border border-stone-200 rounded-lg text-xs text-slate-600">
          Syncing school records...
        </div>
      )}
      {activeTab === 'dashboard' && <DashboardView onNavigate={setActiveTab} />}
      {activeTab === 'students' && <StudentsView />}
      {activeTab === 'batch-marks' && <BatchMarksView />}
      {activeTab === 'attendance' && <AttendanceView />}
      {activeTab === 'batch-fields' && <BatchFieldsView />}
      {activeTab === 'marksheet' && <MarksheetView />}
      {activeTab === 'comms' && <CommsView />}
      {activeTab === 'admin' && session.role === 'ADMIN' && <AdminPanelView />}
    </WorkspaceLayout>
  );
};

export default function App() {
  const envStatus = getFirebaseEnvStatus();

  if (!envStatus.isConfigured) {
    return <ConfigMissingScreen envStatus={envStatus} />;
  }

  return (
    <AppProvider>
      <MainAppShell />
    </AppProvider>
  );
}
