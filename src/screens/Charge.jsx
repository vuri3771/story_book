import { useStore, ui, back, commit } from '../lib/store';
import { usd, monthUsd, modelOf } from '../lib/helpers';
import { usingProxy } from '../lib/api';
import { Icon } from '../icons';

// 혼자 쓰는 앱이라 크레딧 대신 Anthropic 에 실제로 나간 돈(추정)을 보여준다
// 서버 키 모드는 서버가 날짜별로 기록한 값, 내 키 모드는 이 기기에서 센 누적만 있다
const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const dayLabel = d => { const [, m, dd] = d.split('-'); return `${+m}월 ${+dd}일`; };

export default function Charge(){
  const S = useStore();
  const deep = ui.nav.length > 1;
  const rate = S.settings.krw || 1400;
  const days = (S.spend?.days || []).slice().sort((a, b) => b.day.localeCompare(a.day));
  const month = monthUsd(S);
  const today = days.find(d => d.day === todayKst())?.usd || 0;
  const total = usingProxy ? (S.spend?.totalUsd || 0) : (S.usage.krw || 0) / rate;
  const paid = +S.settings.paidUsd || 0;
  const left = paid - total;
  const m = todayKst().slice(0, 7), byModel = {};
  for (const d of days) if (d.day.startsWith(m)) for (const [id, v] of Object.entries(d.models || {})) byModel[id] = (byModel[id] || 0) + v;
  const krw = n => '≈ ' + Math.round(n * rate).toLocaleString('ko-KR') + '원';
  return <>
    <div className="hdr">{deep && <button className="icon-btn" aria-label="뒤로" onClick={back}><Icon n="back"/></button>}<div className="t">쓴 금액</div></div>
    <div className="scroll"><div className="page">
      <div className="bal"><small>이번 달</small><div className="v">{usd(month)}</div><div className="u">{krw(month)} · 오늘 {usd(today)}</div></div>

      <div className="spend-box">
        <div className="sr"><span>지금까지 쓴 금액</span><b>{usd(total)}</b></div>
        <label className="sr"><span>Anthropic에 넣은 돈</span><span className="paid">$<input type="number" inputMode="decimal" min="0" step="1" value={S.settings.paidUsd ?? ''} onChange={e => { S.settings.paidUsd = e.target.value === '' ? '' : +e.target.value; commit(); }}/></span></label>
        <div className="sr"><span>남은 금액(추정)</span><b className={left < 1 ? 'danger' : ''}>{usd(Math.max(0, left))}</b></div>
        {paid > 0 && <div className="gauge-l"><i style={{width: Math.min(100, total / paid * 100) + '%'}}/></div>}
      </div>
      <div className="note" style={{padding:'6px 16px 0', color:'var(--muted)', fontSize:12.5, lineHeight:1.6}}>
        토큰 수에 모델 가격을 곱한 추정이에요. 정확한 잔액은 console.anthropic.com의 Billing에서 확인할 수 있어요. 같은 키를 다른 곳에서도 쓰면 그만큼 더 빠져요.
      </div>

      {Object.keys(byModel).length > 0 && <>
        <div className="sec-h"><b>이번 달 모델별</b></div>
        {Object.entries(byModel).sort((a, b) => b[1] - a[1]).map(([id, v]) => <div key={id} className="hist-row"><div>{modelOf(id).id === id ? modelOf(id).name : id}</div><b>{usd(v)}</b></div>)}
      </>}

      <div className="sec-h"><b>날짜별</b></div>
      {days.length ? days.slice(0, 60).map(d => <div key={d.day} className="hist-row"><div>{dayLabel(d.day)}<small>{d.calls}번 호출</small></div><b>{usd(d.usd)}</b></div>)
        : <div className="empty-box">{usingProxy ? '아직 기록이 없어요. 이번 업데이트 뒤부터 날짜별로 쌓여요.' : '내 키 모드에서는 날짜별 기록이 없어요.'}</div>}
      <div style={{height:28}}/>
    </div></div>
  </>;
}
