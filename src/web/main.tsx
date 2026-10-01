import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { initTheme } from './theme';
import { startUpdater } from './updater';

initTheme();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// PWA: permite instalar Rumbo en el teléfono y abrirlo sin conexión (pantalla principal en caché).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {}));
}
startUpdater();
