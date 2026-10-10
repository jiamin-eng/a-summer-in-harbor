/** One bounded mixer. Platform music/SFX plus original local soft footsteps and transition cue; no provider URLs. */
export class SummerAudio{
 private context?:AudioContext;
 private master?:GainNode;
 private buffers=new Map<string,AudioBuffer>();
 private active=new Set<{source:AudioBufferSourceNode;gain:GainNode}>();
 private current='';
 private effects=0;
 private effectLoads=new Map<string,Promise<AudioBuffer>>();
 private effectTimes=new Map<string,number>();
 private desired='town-a';
 private muted=false;
 private timer=0;
 private generation=0;
 private next=0;
 private stepIndex=0;
 private transitionVoice?:{source:AudioBufferSourceNode;gain:GainNode};
 private stepVoice?:{source:AudioBufferSourceNode;gain:GainNode};
 private rainVoice?:{source:AudioBufferSourceNode;gain:GainNode;filter:BiquadFilterNode};
 private rainWanted=false;
 private rainProfile:'light'|'heavy'|'storm'='light';
 private stormGust=false;
 private weatherGain?:GainNode;
 private weatherVolume=.6;
 private weatherListeners=new Set<()=>void>();
 private rainPreviewTimer:number|undefined;
 private rainPreviewProfile:'light'|'heavy'|'storm'|undefined;
 private thunderTimer:number|undefined;
 private thunderVoice?:AudioBufferSourceNode;
 private thunderBuffer?:AudioBuffer;
 private rainBuffer?:AudioBuffer;
 constructor(){
  document.addEventListener('visibilitychange',()=>{if(!this.context)return;if(document.hidden){this.stopSteps();this.stopTransition(true);this.cancelRainPreview();this.stopRain();this.cancelThunder();void this.context.suspend().then(()=>this.notifyWeather())}else if(!this.muted)void this.context.resume().then(()=>{this.syncRain();this.notifyWeather()}).catch(()=>{})});
 }
 unlock(weatherOnly=false){
  if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=this.muted?0:.22;this.master.connect(this.context.destination);this.weatherGain=this.context.createGain();this.weatherGain.gain.value=this.weatherVolume*3;this.weatherGain.connect(this.master);this.context.addEventListener?.('statechange',()=>this.notifyWeather())}
  if(!this.muted)void this.context.resume().then(()=>{if(!weatherOnly)void this.change();this.syncRain();this.notifyWeather()}).catch(()=>{this.notifyWeather()});
  if(!weatherOnly){this.prepareSteps();this.prepareTransition();}
 }
 setMuted(muted:boolean,weatherOnly=false){this.muted=muted;if(muted){this.stopSteps();this.stopTransition();this.cancelRainPreview();this.stopRain();this.cancelThunder()}if(this.master&&this.context){this.master.gain.cancelScheduledValues(this.context.currentTime);this.master.gain.setTargetAtTime(muted?0:.22,this.context.currentTime,.08)}if(!muted)this.unlock(weatherOnly);this.notifyWeather()}
 /** Original procedural soft rain through the existing unlocked mixer. No
  * generated/downloaded media or extra AudioContext; one looping voice. */
 /** No new context or media: weather bus remains in the original bounded mixer. */
 weatherStatus(){return {enabled:!this.muted,state:this.context?.state??'locked',volume:this.weatherVolume,rainPlaying:!!this.rainVoice,rainPreview:!!this.rainPreviewProfile,profile:this.rainPreviewProfile??this.rainProfile,thunderPending:this.thunderTimer!==undefined,thunderPlaying:!!this.thunderVoice}}
 subscribeWeather(listener:()=>void){this.weatherListeners.add(listener);return()=>{this.weatherListeners.delete(listener)}}
 private notifyWeather(){for(const listener of this.weatherListeners)listener()}
 async enableWeatherAudio(){this.setMuted(false,true);await this.context?.resume();this.syncRain();this.notifyWeather();return this.weatherStatus()}
 setWeatherVolume(volume:number){if(!Number.isFinite(volume))return;this.weatherVolume=Math.min(1,Math.max(0,volume));if(this.weatherGain&&this.context)this.weatherGain.gain.setTargetAtTime(this.weatherVolume*3,this.context.currentTime,.08);this.notifyWeather()}
 private rainLevel(){const profile=this.rainPreviewProfile??this.rainProfile;return profile==='light'?.45:profile==='heavy'?.68:this.stormGust?.80:.50}
 setStormGust(gust:boolean){this.stormGust=gust;this.syncRain()}
 setRain(wanted:boolean,profile:'light'|'heavy'|'storm'='light'){this.rainWanted=wanted;this.rainProfile=profile;if(!wanted)this.cancelRainPreview();this.syncRain();this.notifyWeather()}
 cancelRainPreview(){if(this.rainPreviewTimer!==undefined){clearTimeout(this.rainPreviewTimer);this.rainPreviewTimer=undefined}this.rainPreviewProfile=undefined}
 previewRain(profile:'light'|'heavy'|'storm'='light',duration=3000){this.cancelRainPreview();if(this.muted||document.hidden||this.context?.state!=='running')return false;this.rainPreviewProfile=profile;this.syncRain();this.rainPreviewTimer=window.setTimeout(()=>{this.rainPreviewTimer=undefined;this.rainPreviewProfile=undefined;this.syncRain();this.notifyWeather()},Math.min(5000,Math.max(500,duration)));this.notifyWeather();return true}
 private stopRain(){const voice=this.rainVoice;if(!voice)return;this.rainVoice=undefined;voice.source.stop();voice.source.disconnect();voice.gain.disconnect();voice.filter.disconnect()}
 private syncRain(){
  const c=this.context;
  if((!this.rainWanted&&!this.rainPreviewProfile)||this.muted||document.hidden||!c||c.state!=='running'){this.stopRain();return}
  if(this.rainVoice){this.rainVoice.gain.gain.setTargetAtTime(this.rainLevel(),c.currentTime,.18);return;}
  if(!this.rainBuffer){const buffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate),data=buffer.getChannelData(0);let seed=7411,last=0;
   for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;last=.45*last+.55*(seed/4294967296*2-1);data[i]=last*.32}this.rainBuffer=buffer}
  const source=c.createBufferSource(),gain=c.createGain(),filter=c.createBiquadFilter();source.buffer=this.rainBuffer;source.loop=true;filter.type='lowpass';filter.frequency.value=2200;gain.gain.value=this.rainLevel();
  source.connect(filter);filter.connect(gain);gain.connect(this.weatherGain!);this.rainVoice={source,gain,filter};source.start();
 }
 /** One delayed procedural rumble in the existing gesture-unlocked context. */
 cancelThunder(){if(this.thunderTimer!==undefined){clearTimeout(this.thunderTimer);this.thunderTimer=undefined}const voice=this.thunderVoice;this.thunderVoice=undefined;voice?.stop();this.notifyWeather()}
 queueThunder(indoors=false,delay=1400){
  this.cancelThunder();const c=this.context;
  if(this.muted||document.hidden||!c||c.state!=='running')return false;
  this.thunderTimer=window.setTimeout(()=>{
   this.thunderTimer=undefined;if(this.muted||document.hidden||c.state!=='running')return;
   if(!this.thunderBuffer){const buffer=c.createBuffer(1,c.sampleRate*1.8,c.sampleRate),data=buffer.getChannelData(0);let seed=8751,low=0;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;low=.90*low+.10*(seed/4294967296*2-1);data[i]=low*.7+Math.sin(i/c.sampleRate*2*Math.PI*145)*.025+Math.sin(i/c.sampleRate*2*Math.PI*220)*.02}this.thunderBuffer=buffer}
   const source=c.createBufferSource(),gain=c.createGain(),filter=c.createBiquadFilter(),now=c.currentTime;source.buffer=this.thunderBuffer;filter.type='lowpass';filter.frequency.value=indoors?300:850;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(indoors ? .24 : .65,now+.12);gain.gain.exponentialRampToValueAtTime(.001,now+1.8);source.connect(filter);filter.connect(gain);gain.connect(this.weatherGain!);this.thunderVoice=source;
   source.onended=()=>{if(this.thunderVoice===source)this.thunderVoice=undefined;source.disconnect();filter.disconnect();gain.disconnect();this.notifyWeather()};source.start();this.notifyWeather();
  },delay);this.notifyWeather();return true;
 }
 /** Decode ahead of time; an unloaded step is skipped, never played later. */
 private prepareSteps(){
  const context=this.context;if(!context)return;
  for(const key of ['step-soft-a','step-soft-b']){
   if(this.effectLoads.has(key))continue;
   const load=fetch('./audio/'+key+'.wav').then(r=>{if(!r.ok)throw Error('STEP_LOAD');return r.arrayBuffer()}).then(b=>context.decodeAudioData(b));
   this.effectLoads.set(key,load);void load.then(b=>this.buffers.set(key,b)).catch(()=>this.effectLoads.delete(key));
  }
 }
 stopSteps(){
  const voice=this.stepVoice,context=this.context;if(!voice||!context)return;this.stepVoice=undefined;
  voice.gain.gain.setTargetAtTime(0,context.currentTime,.008);voice.source.stop(context.currentTime+.025);
 }
 private step(){
  const context=this.context;
  if(!context||context.state!=='running'||this.muted||document.hidden||this.effects>=4||this.stepVoice)return;
  const now=performance.now();if(now-(this.effectTimes.get('step')??-1000)<180)return;
  const buffer=this.buffers.get(this.stepIndex%2?'step-soft-b':'step-soft-a');if(!buffer)return;
  this.effectTimes.set('step',now);this.stepIndex++;
  const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=.28;
  source.connect(gain);gain.connect(this.master!);const voice={source,gain};this.stepVoice=voice;this.effects++;
  source.onended=()=>{this.effects--;if(this.stepVoice===voice)this.stepVoice=undefined;source.disconnect();gain.disconnect()};source.start();
 }
 /** Scene cues never wait for a request/decode and never queue stale arrivals. */
 private prepareTransition(){
  const context=this.context,key='transition-soft';if(!context||this.effectLoads.has(key))return;
  const load=fetch('./audio/transition-soft.wav').then(r=>{if(!r.ok)throw Error('TRANSITION_LOAD');return r.arrayBuffer()}).then(b=>context.decodeAudioData(b));
  this.effectLoads.set(key,load);void load.then(b=>this.buffers.set(key,b)).catch(()=>this.effectLoads.delete(key));
 }
 private stopTransition(immediate=false){
  const voice=this.transitionVoice,context=this.context;if(!voice||!context)return;this.transitionVoice=undefined;
  voice.gain.gain.setTargetAtTime(0,context.currentTime,.008);voice.source.stop(context.currentTime+(immediate?0:.025));
 }
 private transition(){
  this.stopSteps();this.stopTransition();
  const context=this.context;if(!context||context.state!=='running'||this.muted||document.hidden||this.effects>=4)return;
  const now=performance.now();if(now-(this.effectTimes.get('door')??-1000)<180)return;
  const buffer=this.buffers.get('transition-soft');if(!buffer)return;
  this.effectTimes.set('door',now);
  const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=.42;
  source.connect(gain);gain.connect(this.master!);const voice={source,gain};this.transitionVoice=voice;this.effects++;
  source.onended=()=>{this.effects--;if(this.transitionVoice===voice)this.transitionVoice=undefined;source.disconnect();gain.disconnect()};source.start();
 }
 setArea(area:string){this.desired=area==='practice'?'practice':area==='coast'||area==='harbor'?'coast':area==='hill'?'hill':'town-a';if(this.context)void this.change()}
 effect(key:'step'|'door'|'hit'|'progress'){
  if(key==='step'){this.step();return}
  if(key==='door'){this.transition();return}
  const context=this.context;if(!context||this.muted||document.hidden||this.effects>=4)return;
  const now=performance.now();if(now-(this.effectTimes.get(key)??-1000)<90)return;this.effectTimes.set(key,now);
  let load=this.effectLoads.get(key);if(!load){load=fetch('./audio/'+key+'.mp3').then(r=>{if(!r.ok)throw Error('SFX_LOAD');return r.arrayBuffer()}).then(b=>context.decodeAudioData(b));this.effectLoads.set(key,load)}
  void load.then(buffer=>{if(this.effects>=4||this.muted||document.hidden)return;const voice=context.createBufferSource(),gain=context.createGain();voice.buffer=buffer;gain.gain.value=key==='hit'?.45:.7;voice.connect(gain);gain.connect(this.master!);this.effects++;voice.onended=()=>{this.effects--;voice.disconnect();gain.disconnect()};voice.start()}).catch(()=>this.effectLoads.delete(key));
 }
 private async change(){
  const context=this.context!;if(!context||this.current===this.desired)return;
  const key=this.desired,token=++this.generation;this.current=key;
  try{
   let buffer=this.buffers.get(key);
   if(!buffer){const response=await fetch('./audio/'+key+'.mp3');if(!response.ok)throw Error('AUDIO_LOAD');buffer=await context.decodeAudioData(await response.arrayBuffer());this.buffers.set(key,buffer)}
   if(token!==this.generation)return;
   clearTimeout(this.timer);
   for(const voice of this.active){voice.gain.gain.cancelScheduledValues(context.currentTime);voice.gain.gain.setTargetAtTime(0,context.currentTime,.2);voice.source.stop(context.currentTime+.8)}
   this.next=context.currentTime+.02;
   const schedule=()=>{
    if(token!==this.generation)return;
    if(this.next-context.currentTime<3){
     const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer!;source.connect(gain);gain.connect(this.master!);
     const start=Math.max(context.currentTime,this.next),duration=buffer!.duration,overlap=Math.min(2,duration/5);
     gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(1,start+overlap);
     gain.gain.setValueAtTime(1,start+duration-overlap);gain.gain.linearRampToValueAtTime(0,start+duration);
     const voice={source,gain};this.active.add(voice);source.onended=()=>{source.disconnect();gain.disconnect();this.active.delete(voice)};
     source.start(start);this.next=start+duration-overlap;
    }
    this.timer=window.setTimeout(schedule,1000);
   };schedule();
  }catch{if(token===this.generation)this.current=''}
 }
}
export const summerAudio=new SummerAudio();
