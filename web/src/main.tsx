import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import { App } from './App.tsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/select.css';
import './styles/shell.css';
import './styles/home.css';
import './styles/hud.css';
import './styles/usage.css';
import './styles/chat.css';
import './styles/pages.css';
import './styles/knowledge.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
