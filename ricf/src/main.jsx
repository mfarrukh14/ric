import { createRoot } from 'react-dom/client';
import App from './app/App';
import { applyTheme } from './lib/theme';
import { installSessionGuard } from './lib/sessionGuard';
import './index.css';

applyTheme();
installSessionGuard();

createRoot(document.getElementById('root')).render(<App />);
