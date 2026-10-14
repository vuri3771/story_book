import { useStore } from '../lib/store';
import { SettingsForm } from '../sheets';

export default function Settings(){
  useStore();
  return <>
    <div className="hdr"><div className="t">설정</div></div>
    <div className="scroll"><div style={{maxWidth:760, margin:'0 auto', width:'100%', paddingTop:8}}><SettingsForm/></div></div>
  </>;
}
