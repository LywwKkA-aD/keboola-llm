import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { TopBar } from './components/shell/TopBar.tsx';
import { LiveProvider } from './live/live-context.tsx';
import { AgentsPage } from './pages/AgentsPage.tsx';
import { ApprovalsPage } from './pages/ApprovalsPage.tsx';
import { ChatPage } from './pages/ChatPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { KnowledgePage } from './pages/KnowledgePage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { SettingsProvider } from './state/settings-context.tsx';
import { TeamProvider } from './state/team-context.tsx';

export function App() {
  return (
    <SettingsProvider>
      <TeamProvider>
        <LiveProvider>
          <BrowserRouter>
            <div className="app">
              <TopBar />
              <main className="app__main">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/chat/:threadId" element={<ChatPage />} />
                  <Route path="/agents" element={<AgentsPage />} />
                  <Route path="/team" element={<Navigate to="/agents" replace />} />
                  <Route path="/approvals" element={<ApprovalsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/knowledge" element={<KnowledgePage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          </BrowserRouter>
        </LiveProvider>
      </TeamProvider>
    </SettingsProvider>
  );
}
