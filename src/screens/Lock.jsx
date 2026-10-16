// 처음 들어올 때 비밀번호 화면 : 맞히면 이 기기에 기억해서 다음부터는 바로 들어간다
// 공개 저장소라 비밀번호는 해시로만 둔다
import { useState, useRef, useEffect } from 'react';

const KEY = 'storychat_unlocked';
const HASH = '2290d2b4ac72317b99e54f47bb4c0fd690ef6fcef30375f4f8fd52fafa2c60d3';

// crypto.subtle 은 https 나 localhost 에서만 있어서, 휴대폰으로 PC 로컬 주소(http)에 들어올 때를 위해 직접 계산도 한다
function sha256js(bytes){
  const K = [], H = [];
  const frac = x => (x - Math.floor(x)) * 2 ** 32 | 0;
  for (let n = 2, c = 0; c < 64; n++){ if ([...Array(n - 2)].every((_, i) => n % (i + 2))){ if (c < 8) H[c] = frac(n ** .5); K[c++] = frac(n ** (1 / 3)); } }
  const l = bytes.length, m = new Uint8Array(((l + 9 + 63) >> 6) << 6);
  m.set(bytes); m[l] = 0x80; new DataView(m.buffer).setUint32(m.length - 4, l * 8);
  const r = (x, n) => x >>> n | x << (32 - n), w = new Int32Array(64), dv = new DataView(m.buffer);
  for (let o = 0; o < m.length; o += 64){
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(o + i * 4);
    for (let i = 16; i < 64; i++) w[i] = (r(w[i-15], 7) ^ r(w[i-15], 18) ^ w[i-15] >>> 3) + w[i-16] + (r(w[i-2], 17) ^ r(w[i-2], 19) ^ w[i-2] >>> 10) + w[i-7] | 0;
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++){
      const t1 = h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + (e & f ^ ~e & g) + K[i] + w[i] | 0;
      const t2 = (r(a, 2) ^ r(a, 13) ^ r(a, 22)) + (a & b ^ a & c ^ b & c) | 0;
      h = g; g = f; f = e; e = d + t1 | 0; d = c; c = b; b = a; a = t1 + t2 | 0;
    }
    [a, b, c, d, e, f, g, h].forEach((x, i) => H[i] = H[i] + x | 0);
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
async function sha(t){
  const bytes = new TextEncoder().encode('storychat-lock:' + t);
  if (!crypto.subtle) return sha256js(bytes);
  const b = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function isUnlocked(){ try { return localStorage.getItem(KEY) === HASH; } catch(e){ return false; } }

export default function Lock({onOk}){
  const [v, setV] = useState(''), [err, setErr] = useState(false);
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); }, []);
  const go = async e => {
    e.preventDefault();
    if (await sha(v.trim()) === HASH){ try { localStorage.setItem(KEY, HASH); } catch(e){} onOk(); }
    else { setErr(true); setV(''); ref.current?.focus(); }
  };
  return <form className="lock" onSubmit={go}>
    <img src="logo.svg" alt="" width="64" height="64"/>
    <h1>나만의 스토리 챗</h1>
    <p>비밀번호를 입력해 주세요.</p>
    <input ref={ref} type="password" inputMode="numeric" autoComplete="current-password" aria-label="비밀번호" value={v} onChange={e => { setV(e.target.value); setErr(false); }}/>
    {err && <small>비밀번호가 맞지 않아요.</small>}
    <button className="btn red" disabled={!v.trim()}>들어가기</button>
  </form>;
}
