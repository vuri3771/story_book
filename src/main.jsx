import { createRoot } from 'react-dom/client';
import App from './App';
import { boot, onSaved } from './lib/store';
import { scheduleSync, startRemote } from './lib/remote';
import { applyLook } from './lib/look';
import './styles.css';
import './app.css';

applyLook();
boot().then(() => {
  createRoot(document.getElementById('root')).render(<App/>);
  onSaved(scheduleSync);
  startRemote();
});
