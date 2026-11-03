import {useEffect,useState} from 'react';
import {Download} from 'lucide-react';
import {Modal} from './common';
interface InstallEvent extends Event{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>;}
export function InstallApp(){
 const [prompt,setPrompt]=useState<InstallEvent|null>(null),[open,setOpen]=useState(false),[error,setError]=useState(''),[installed,setInstalled]=useState(()=>matchMedia('(display-mode: standalone)').matches||!!(navigator as Navigator&{standalone?:boolean}).standalone);
 useEffect(()=>{const capture=(e:Event)=>{e.preventDefault();setPrompt(e as InstallEvent);},done=()=>{setInstalled(true);setPrompt(null);};addEventListener('beforeinstallprompt',capture);addEventListener('appinstalled',done);return()=>{removeEventListener('beforeinstallprompt',capture);removeEventListener('appinstalled',done);};},[]);
 async function install(){if(!prompt){setOpen(true);return;}try{await prompt.prompt();const choice=await prompt.userChoice;setPrompt(null);if(choice.outcome==='accepted')setOpen(false);}catch{setError('浏览器未能打开安装窗口，请按下方步骤安装。');setOpen(true);}}
 return <><button className="toolbar-button install-action" aria-label="安装应用" title="安装到电脑或手机" onClick={()=>installed?setOpen(true):void install()}><Download size={21}/></button>{open&&<Modal title="安装 Trading 应用" onClose={()=>setOpen(false)}><div className="form-body">{error&&<p className="error">{error}</p>}{prompt&&<button className="btn primary" onClick={()=>void install()}>立即安装</button>}<section><h3>Windows / Mac</h3><p className="muted small">用 Chrome 或 Edge 打开此网页，点击地址栏的安装图标，或在浏览器菜单中选择「安装应用」。</p></section><section><h3>iPhone / iPad</h3><p className="muted small">用 Safari 打开网页 → 分享 →「添加到主屏幕」。如有「作为网页 App 打开」，请开启。</p></section><section><h3>Android</h3><p className="muted small">用 Chrome 打开网页 → 菜单 →「安装应用」或「添加到主屏幕」。</p></section><div className="subtle-note">首次安装需联网；记账支持离线，行情需联网。</div></div></Modal>}</>;
}
