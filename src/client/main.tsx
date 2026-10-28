import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles/tokens.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App.tsx';
import { initSessionToken } from './app/token.ts';

initSessionToken();

const container = document.getElementById('root');
if (container === null) {
  throw new Error('ArtifactForge: #root element missing from index.html');
}
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
