import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { applyTheme } from './lib/settings';
import { setupUpdates } from './lib/update';

applyTheme();
createRoot(document.getElementById('root')!).render(<App />);
setupUpdates();
