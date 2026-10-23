import {readSceneStartup} from '../world/scene-startup';
import {tx,type Locale} from '../world/data';
export function SceneStartupDetails({locale}:{locale:Locale}){
 const value=readSceneStartup();if(!value)return null;
 return <details className="harbor-entry-diagnostics" data-scene-startup-details>
  <summary>{tx(['启动详情','Startup details'],locale)}</summary>
  <div style={{maxHeight:'24vh',overflow:'auto'}}><p>{tx(['可截图反馈；这里只显示阶段和错误代码，不包含账号或凭据。','Share these stages and codes when reporting a problem. No account or credentials appear.'],locale)}</p>
   <dl>{Object.entries(value).map(([key,item])=><div key={key}><dt>{key}</dt><dd>{item}</dd></div>)}</dl>
  </div>
 </details>;
}
