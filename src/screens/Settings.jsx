import { useState } from 'react';
import { useStore } from '../lib/store';
import { SettingsForm } from '../sheets';

// 설정을 기능별 탭으로 나눈다. 고른 탭은 이 기기에 기억한다
const TABS = [['look', '화면'], ['model', '모델'], ['chat', '대화'], ['profile', '대화 프로필'], ['account', '계정·백업']];
const KEY = 'storychat_settab';

export default function Settings(){
  useStore();
  const [sec, setSec] = useState(() => { try { return localStorage.getItem(KEY) || 'look'; } catch(e){ return 'look'; } });
  const pick = k => { setSec(k); try { localStorage.setItem(KEY, k); } catch(e){} };
  return <>
    <div className="hdr"><div className="t">설정</div></div>
    <div className="set-tabs">{TABS.map(([k, n]) => <button key={k} className={sec === k ? 'on' : ''} onClick={() => pick(k)}>{n}</button>)}</div>
    <div className="scroll"><div style={{maxWidth:760, margin:'0 auto', width:'100%', paddingTop:8}}><SettingsForm key={sec} sec={sec}/></div></div>
  </>;
}
