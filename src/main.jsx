import { createRoot } from 'react-dom/client';
import App from './App';
import { boot, onSaved, startHistory } from './lib/store';
import { startSwipe } from './lib/swipe';
import { scheduleSync, startRemote } from './lib/remote';
import { applyLook } from './lib/look';
import './styles.css';
import './app.css';

applyLook();
boot().then(() => {
  createRoot(document.getElementById('root')).render(<App/>);
  startHistory();
  startSwipe();
  onSaved(scheduleSync);
  startRemote();
});
