import {useState,useRef} from 'react';
import {browserRendererProbe,type RendererCapability} from '../world/renderer-capability';
import {readSceneStartup} from '../world/scene-startup';
import {tx,type Locale} from '../world/data';
export function SceneStartupDetails({locale}:{locale:Locale}){
 const [probe,setProbe]=useState<RendererCapability|'running'|'failed'|null>(null),probing=useRef(false);
 const check=()=>{if(probing.current)return;probing.current=true;setProbe('running');void browserRendererProbe().then(setProbe,()=>setProbe('failed'))};
 const value=readSceneStartup();if(!value)return null;
 return <><details className="harbor-entry-diagnostics" data-scene-startup-details>
  <summary>{tx(['启动详情','Startup details'],locale)}</summary>
  <div style={{maxHeight:'24vh',overflow:'auto'}}><p>{tx(['可截图反馈；这里只显示阶段和错误代码，不包含账号或凭据。','Share these stages and codes when reporting a problem. No account or credentials appear.'],locale)}</p>
   <dl>{Object.entries(value).map(([key,item])=><div key={key}><dt>{key}</dt><dd>{item}</dd></div>)}</dl>
  </div>
 </details>{value.code==='RENDERER_UNAVAILABLE'&&<><p>{tx(['场景绘制后端未能启动。可运行一次能力检查，结果仅显示支持状态，不读取显卡型号或账号。','The scene renderer could not start. Run a one-time capability check; it reports support states without GPU identity or account data.'],locale)}</p><button disabled={probe!==null} onClick={check}>{tx(['检查绘制能力','Check renderer capability'],locale)}</button>{probe&&<div role="status" style={{maxHeight:'24vh',overflow:'auto'}}><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{typeof probe==='string'?probe:JSON.stringify(probe,null,2)}</pre></div>}</>}{value.code==='WASM_POLICY_BLOCKED'&&<p>{tx(['当前运行环境阻止了场景所需的 WebAssembly。请把启动详情反馈给我们；已保存的旅程保留。','This environment blocked WebAssembly required by the scene. Please share the startup details with us; your saved journey is retained.'],locale)}</p>}{value.code==='SCENE_ASSET_TIMEOUT'&&<><p>{tx(['图片准备超时。重新载入游戏可重新开始加载，已保存的旅程保留。','Image preparation timed out. Reload the game to start loading again. Your saved journey is retained.'],locale)}</p><button onClick={()=>location.reload()}>{tx(['重新载入游戏','Reload game'],locale)}</button></>}</>;
}
