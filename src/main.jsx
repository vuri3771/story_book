import { createRoot } from 'react-dom/client';
import App from './App';
import { boot, onSaved, startHistory } from './lib/store';
import { startSwipe } from './lib/swipe';
import { scheduleSync, startRemote } from './lib/remote';
import { applyLook, adoptLook } from './lib/look';
import { S } from './lib/store';
import './styles.css';
import './app.css';

applyLook();
boot().then(() => {
  adoptLook(S.settings.look);
  createRoot(document.getElementById('root')).render(<App/>);
  startHistory();
  startSwipe();
  onSaved(scheduleSync);
  startRemote();
});
