import { Fragment } from 'react';
import { useStore, ui, tab } from './lib/store';
import { Icon } from './icons';
import Home from './screens/Home';
import Stories from './screens/Stories';
import Chats from './screens/Chats';
import Charge from './screens/Charge';
import Settings from './screens/Settings';
import StoryPage from './screens/StoryPage';
import StoryEditor from './screens/StoryEditor';
import ChatPage from './screens/ChatPage';
import ShortcutEditor from './screens/ShortcutEditor';

const SCREENS = { home:Home, stories:Stories, chats:Chats, charge:Charge, settings:Settings, story:StoryPage, editor:StoryEditor, chat:ChatPage, shortcut:ShortcutEditor };
const TABS = [['home','홈','home'], ['stories','내 스토리','book'], ['chats','이어서 하기','chat'], ['charge','쓴 금액','wallet'], ['settings','설정','gear']];

export default function App(){
  useStore();
  const top = ui.nav[ui.nav.length-1];
  const Screen = SCREENS[top.name] || Home;
  const root = ui.nav[0].name;
  // 탭 첫 화면에서만 모바일 탭바를 보이고, 대화나 편집 같은 안쪽 화면에서는 숨긴다
  const deep = ui.nav.length > 1;
  // 화면이 바뀌면 새로 그려서 원본처럼 입력 상태를 초기화한다
  const key = ui.nav.length + ':' + top.name + ':' + JSON.stringify(top.props || {});
  return <>
    <div className="shell">
      <main id="app"><Screen key={key} {...(top.props || {})}/></main>
      <nav className={'tabbar' + (deep ? ' deep' : '')} aria-label="메인 메뉴">
        <div className="brand">스토리챗</div>
        {TABS.map(([k, label, icon]) => <button key={k} className={root === k ? 'on' : ''} aria-current={root === k && !deep ? 'page' : undefined} onClick={() => tab(k)}><Icon n={icon}/><span>{label}</span></button>)}
      </nav>
    </div>
    {ui.drawer && <Fragment key={'d' + ui.drawerSeq}>{ui.drawer}</Fragment>}
    {ui.sheet && <Fragment key={'s' + ui.sheetSeq}>{ui.sheet}</Fragment>}
    {ui.toast && <div id="toast" key={ui.toast}>{ui.toast}</div>}
  </>;
}
