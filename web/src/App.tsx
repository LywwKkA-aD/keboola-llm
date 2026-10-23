import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router';
import { AquariumPage } from './pages/AquariumPage.tsx';
import { ChatPage } from './pages/ChatPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { TeamPage } from './pages/TeamPage.tsx';
import { SettingsProvider, useSettings } from './state/settings-context.tsx';
import { TeamProvider } from './state/team-context.tsx';

const NAV = [
  ['/chat', 'nav.chat'],
  ['/team', 'nav.team'],
  ['/aquarium', 'nav.aquarium'],
  ['/settings', 'nav.settings'],
] as const;

function TopBar() {
  const { t } = useSettings();
  return (
    <header className="topbar">
      <div className="topbar__brand">{t('app.title')}</div>
      <nav className="topbar__nav">
        {NAV.map(([to, key]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `topbar__link${isActive ? ' topbar__link--active' : ''}`}>
            {t(key)}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

export function App() {
  return (
    <SettingsProvider>
      <TeamProvider>
        <BrowserRouter>
          <div className="app">
            <TopBar />
            <main className="app__main">
              <Routes>
                <Route path="/" element={<Navigate to="/chat" replace />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/chat/:threadId" element={<ChatPage />} />
                <Route path="/team" element={<TeamPage />} />
                <Route path="/aquarium" element={<AquariumPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/chat" replace />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </TeamProvider>
    </SettingsProvider>
  );
}
