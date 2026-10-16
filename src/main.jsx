import { createRoot } from 'react-dom/client';
import App from './App';
import Lock, { isUnlocked } from './screens/Lock';
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
  const root = createRoot(document.getElementById('root'));
  // 비밀번호를 맞힌 기기에서만 앱을 띄우고 서버 동기화를 시작한다
  const start = () => {
    root.render(<App/>);
    startHistory();
    startSwipe();
    onSaved(scheduleSync);
    startRemote();
  };
  if (isUnlocked()) start(); else root.render(<Lock onOk={start}/>);
});
