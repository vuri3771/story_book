// 홈 화면에 추가해서 앱처럼 열면 아이폰은 브라우저 뒤로가기 제스처가 없어서 직접 만든다
// 왼쪽 끝에서 오른쪽으로 밀면 뒤로, 오른쪽 끝에서 왼쪽으로 밀면 앞으로
// 브라우저나 안드로이드는 자체 제스처가 브라우저 기록으로 이미 동작해서 여기서는 건드리지 않는다
import { back, forward, ui } from './store';

const EDGE = 24, NEED = 70;

export function startSwipe(){
  if (navigator.standalone !== true) return;
  let sx = 0, sy = 0, dir = 0, el = null, dx = 0;
  addEventListener('touchstart', e => {
    const t = e.touches[0];
    dir = t.clientX < EDGE ? 1 : t.clientX > innerWidth - EDGE ? -1 : 0;
    // 시트나 사이드 메뉴가 떠 있을 땐 화면 이동을 하지 않는다
    if (ui.sheet || ui.drawer) dir = 0;
    if (dir === 1 && ui.nav.length < 2) dir = 0;
    sx = t.clientX; sy = t.clientY; dx = 0;
    el = dir ? document.querySelector('.shell') : null;
  }, {passive:true});
  addEventListener('touchmove', e => {
    if (!dir) return;
    const t = e.touches[0];
    dx = t.clientX - sx;
    if (Math.abs(t.clientY - sy) > Math.abs(dx) && Math.abs(dx) < 20){ dir = 0; el && (el.style.transform = ''); return; }
    if (el && dx * dir > 0) el.style.transform = `translateX(${Math.min(Math.abs(dx), 120) * dir * .5}px)`;
  }, {passive:true});
  const end = () => {
    if (!dir) return;
    if (el){ el.style.transition = 'transform .18s'; el.style.transform = ''; setTimeout(() => { if (el) el.style.transition = ''; }, 200); }
    if (dx * dir > NEED){ dir === 1 ? back() : forward(); }
    dir = 0;
  };
  addEventListener('touchend', end);
  addEventListener('touchcancel', end);
}
