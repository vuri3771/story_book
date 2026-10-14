import { useState } from 'react';
import { useStore, ui, back, openSheet } from '../lib/store';
import { PACKAGES, PAY_METHODS } from '../lib/constants';
import { won, credit } from '../lib/helpers';
import { usingProxy } from '../lib/api';
import { PayConfirmSheet } from '../sheets';
import { Icon } from '../icons';

const fmt = n => Math.round(n).toLocaleString('ko-KR');
const dateOf = t => { const d = new Date(t); return `${d.getMonth()+1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };

export default function Charge(){
  const S = useStore();
  const [sel, setSel] = useState(PACKAGES.find(p => p.best).id);
  const pkg = PACKAGES.find(p => p.id === sel);
  const w = S.wallet || {balance:0, history:[]};
  const deep = ui.nav.length > 1;
  return <>
    <div className="hdr">{deep && <button className="icon-btn" aria-label="뒤로" onClick={back}><Icon n="back"/></button>}<div className="t">충전</div></div>
    <div className="scroll"><div className="page">
      <div className="bal"><small>보유 크레딧</small><div className="v">{credit(w.balance)}</div><div className="u">지금까지 쓴 금액 ≈ {won(S.usage.krw || 0)}원</div></div>
      {!usingProxy && <div className="notice">지금은 내 API 키 모드라서 대화 요금이 크레딧이 아니라 내 Anthropic 계정에서 나가요. 서버 연결 후에는 크레딧에서 차감돼요.</div>}
      <div className="sec-h"><b>충전 금액</b></div>
      <div className="pkgs">{PACKAGES.map(p => <button key={p.id} className={'pkg' + (sel === p.id ? ' on' : '')} onClick={() => setSel(p.id)}>
        {p.bonus > 0 && <span className="bn">+{Math.round(p.bonus / p.price * 100)}%</span>}
        <b>{fmt(p.price + p.bonus)}</b>
        <span className="pr">{fmt(p.price)}원</span>
        {p.best && <span className="best">가장 많이 골라요</span>}
      </button>)}</div>
      <div style={{padding:'16px 16px 4px'}}><button className="btn red" style={{width:'100%'}} onClick={() => openSheet(<PayConfirmSheet pkg={pkg} onDone={() => { if (deep) back(); }}/>)}>{fmt(pkg.price)}원 충전하기</button></div>
      <div className="note" style={{padding:'4px 16px', color:'var(--muted)', fontSize:12.5}}>1크레딧은 1원이에요. 한 번 보낼 때 모델에 따라 몇 원에서 수십 원이 들어요.</div>
      <div className="sec-h"><b>충전 내역</b></div>
      {w.history.length ? w.history.map(h => <div key={h.id} className="hist-row"><div>{fmt(h.price)}원 결제{h.test ? ' (테스트)' : ''}<small>{dateOf(h.at)} · {PAY_METHODS.find(m => m.id === h.method)?.name || ''}</small></div><b>+{fmt(h.credit)}</b></div>)
        : <div className="empty-box">충전 내역이 없어요</div>}
      <div style={{height:28}}/>
    </div></div>
  </>;
}
