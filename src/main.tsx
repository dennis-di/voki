import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { applyTheme } from './lib/settings';

applyTheme();
createRoot(document.getElementById('root')!).render(<App />);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => { /* egal */ });
