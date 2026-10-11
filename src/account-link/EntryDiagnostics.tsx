import {useEffect,useState} from 'react';
import {tx,type Locale} from '../world/data';
import {readEntryDiagnostics} from './entry-diagnostics';
import './entry-diagnostics.css';
export function EntryDiagnostics({locale}:{locale:Locale}){
 const [open,setOpen]=useState(false),[snapshot,setSnapshot]=useState(()=>readEntryDiagnostics(typeof window==='undefined'?{}:window));
 useEffect(()=>{if(!open)return;const sample=()=>setSnapshot(readEntryDiagnostics(window));sample();const timer=setInterval(sample,500);return()=>clearInterval(timer)},[open]);
 return <details className="harbor-entry-diagnostics" onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary>{tx(['连接详情','Connection details'],locale)}</summary>
  {open&&<div><p>{tx(['可截图反馈。这里只显示状态与版本，不包含账号、验证码或凭据。','You can share a screenshot. Only status and versions appear; account IDs and credentials are excluded.'],locale)}</p>
   <dl>{Object.entries(snapshot).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></div>}
 </details>;
}
