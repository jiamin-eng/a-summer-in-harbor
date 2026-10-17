import {EntryDiagnostics} from './EntryDiagnostics';
import type {JourneyChoice} from '../story/client';
import {tx,type Locale,type Words} from '../world/data';
import {candidatePlatformTokenEnabled} from './platform-token';
export function AccountStart({account,directory,locale,busy,error,onLogin,onContinue,onNew,onRetry}:{account:boolean;directory?:JourneyChoice;locale:Locale;busy:boolean;error:Words|null;onLogin:()=>void;onContinue:()=>void;onNew:()=>void;onRetry:()=>void}){
 const full=(directory?.journeys.length??0)>=100;
 return <main className="harbor-entry harbor-account-entry" aria-busy={busy}>
 <img className="harbor-entry__art" src="./poster.png" alt="" draggable={false}/><small>A SUMMER IN HARBOR</small>
 <h1>{tx(['海湾新生活','A Summer in Harbor'],locale)}</h1>
 <p>{tx(['一只旅行包。一个陌生小镇。一个属于你的夏天。','One bag. An unfamiliar town. A summer of your own.'],locale)}</p>
 <div className="harbor-entry__actions">
 {!account?<button className="harbor-primary" disabled={busy} onClick={onLogin}>{tx(['登录并开始','Sign in to start'],locale)}</button>:directory?<>
 {!!directory.journeys.length&&<button className="harbor-primary" disabled={busy} onClick={onContinue}>{tx(['继续','Continue'],locale)}</button>}
 <button className={directory.journeys.length?'':'harbor-primary'} disabled={busy||full} onClick={onNew}>{tx(['新游戏','New game'],locale)}</button>
 </>:error&&<button className="harbor-primary" disabled={busy} onClick={onRetry}>{tx(['重新读取旅程','Read journeys again'],locale)}</button>}
 </div>
 <div className="harbor-entry__feedback" aria-live="polite">
 {account&&!candidatePlatformTokenEnabled&&<p>{tx(['内部原型：宿主身份未验证。','Internal prototype: host identity is unverified.'],locale)}</p>}
 {busy&&<p role="status">{tx(account?['正在读取你的旅程…','Finding your journeys…']:['请在登录窗口中继续。','Continue in the sign-in window.'],locale)}</p>}
 {!busy&&error&&<p className="harbor-error" role="alert">{tx(error,locale)}</p>}
 {full&&<p>{tx(['已保留100段旅程。继续游戏后，可在系统里切换旧档。','You have 100 saved journeys. Continue, then switch journeys in System.'],locale)}</p>}
 </div>
 <EntryDiagnostics locale={locale}/>
 </main>;
}
