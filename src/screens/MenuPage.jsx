// 대화 화면 오른쪽에서 밀려 나오는 사이드 메뉴
import { useStore, go, tab, commit, openSheet, closeDrawer, toast } from '../lib/store';
import { STYLES, LENGTHS, EFFORTS, DEFAULT_INFO, MAX_IMAGES } from '../lib/constants';
import { chatById, storyOf, personaOf, modelOf, coverOf, won } from '../lib/helpers';
import { run } from '../lib/engine';
import { Drawer, ask, GuideSheet, ProfileSheet, NotesSheet, StyleSheet, MemorySheet, LengthSheet, ImageSheet, LookSheet, requestShortcutPop } from '../sheets';
import { Icon } from '../icons';
import { Ava } from '../render';

const MI = ({icon, label, right, onClick}) => <button className="mi" onClick={onClick}><Icon n={icon}/><span className="l">{label}</span>{right && <small>{right}</small>}<span className="chev" style={{width:20}}><Icon n="chev"/></span></button>;

export default function ChatMenu({id}){
  const S = useStore();
  const c = chatById(id);
  if (!c) return null;
  const st = storyOf(c), p = personaOf(c);
  const imgs = [...(st.images||[]), ...st.characters.filter(x => x.image).map(x => ({tag:x.name, data:x.image}))];
  const leaveTo = (name, props) => { closeDrawer(); go(name, props); };
  return (
    <Drawer>
      <div className="hdr" style={{border:0}}><button className="icon-btn" aria-label="닫기" onClick={closeDrawer}><Icon n="back"/></button><span style={{flex:1}}/><span className="pill" onClick={() => { closeDrawer(); tab('charge'); }}>≈ {won(c.cost || 0)}원</span></div>
      <div className="scroll">
        <div className="prof">{st.characters.find(x => x.image) ? <Ava ch={st.characters.find(x => x.image)} className="pimg"/> : <img src={coverOf(st)} alt=""/>}<div><div className="nm"><b>{st.title}</b></div><div className="nm" style={{fontSize:16, marginTop:4}}>{p?.name || '나'} · {modelOf(c.model).name}</div></div></div>
        <button className="mh" onClick={() => leaveTo('editor', {id:st.id})}>이미지 보관함({imgs.length}/{MAX_IMAGES})<span style={{width:22, color:'var(--muted)'}}><Icon n="chev"/></span></button>
        <div className="vault">{imgs.length ? imgs.map((im, i) => <img key={i} src={im.data} alt={im.tag} onClick={() => openSheet(<ImageSheet src={im.data} alt={im.tag}/>)}/>) : <div className="empty">스토리 편집에서 이미지를 추가하세요</div>}</div>
        <div className="ml">채팅방 설정</div>
        <MI icon="compass" label="플레이 가이드" onClick={() => openSheet(<GuideSheet chat={c}/>)}/>
        <MI icon="profile" label="대화 프로필" right={p?.name} onClick={() => openSheet(<ProfileSheet chat={c}/>)}/>
        <MI icon="note" label="유저노트" right={c.notes ? '작성됨' : ''} onClick={() => openSheet(<NotesSheet chat={c}/>)}/>
        <MI icon="style" label="문체 변경" right={STYLES[c.style || 'novel']?.name} onClick={() => openSheet(<StyleSheet chat={c}/>)}/>
        <MI icon="clock" label="요약 메모리" right={c.memory ? `${c.summarizedUpTo}개 요약됨` : ''} onClick={() => openSheet(<MemorySheet chat={c}/>)}/>
        <MI icon="style" label="글꼴, 글자 크기" onClick={() => openSheet(<LookSheet/>)}/>
        <MI icon="slash" label="단축어 관리" onClick={() => { requestShortcutPop(); closeDrawer(); commit(); }}/>
        <div className="ml">스토리 고급 설정</div>
        <MI icon="slider" label="답변 길이 및 생각 조절" right={LENGTHS[c.length||'normal'].name + (c.minChars ? ` ${c.minChars}자+` : '') + ' · ' + EFFORTS[c.effort||'low']} onClick={() => openSheet(<LengthSheet chat={c}/>)}/>
        <div className="mi"><Icon n="mask"/><span className="l">유저 사칭 방지</span><button className={'toggle ' + (c.noImpersonate !== false ? 'on' : '')} aria-label="유저 사칭 방지" onClick={() => { c.noImpersonate = c.noImpersonate === false; commit(); }}/></div>
        <div className="mi"><Icon n="info"/><span className="l">매 답변 INFO 창</span><button className={'toggle ' + (st.infoOn ? 'on' : '')} aria-label="INFO 창" onClick={() => { st.infoOn = !st.infoOn; if (st.infoOn && !st.info) st.info = DEFAULT_INFO; commit(); }}/></div>
        <MI icon="book" label="스토리 편집" onClick={() => leaveTo('editor', {id:st.id})}/>
        <MI icon="trash" label="이 대화 삭제" onClick={() => ask('이 대화를 삭제할까요? 되돌릴 수 없어요.', '삭제', () => {
          if (run.busy && run.chatId === c.id) run.abort?.abort();
          S.chats = S.chats.filter(x => x.id !== c.id); closeDrawer(); commit(); tab('chats'); toast('대화를 삭제했어요.');
        })}/>
        <div style={{height:30}}/>
      </div>
    </Drawer>
  );
}
