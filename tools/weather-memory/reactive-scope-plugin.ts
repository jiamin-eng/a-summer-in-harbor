/** Candidate compatibility fix for CanvasEngine2.2.0: computed/effect use N's
 * reactive subscription collector while components use Xu. Own subscriptions
 * by the component and mount element, with nested tracker restoration. */
export function reactiveScopePlugin(){return{name:'isolated-reactive-component-scope',enforce:'pre' as const,transform(code:string,id:string){if(!id.endsWith('/canvasengine/dist/index.js'))return null;const setup='function ad(e, t) {\n\tlet n';const before='let a;\n\ttry {\n\t\ta = e(t);';const after='Xu = null, Zu = null, Qu = null;';const mount='function o(e, t, n) {\n\t\tt.componentInstance.onMount?.(t, n);\n\t\tfor (let e in t.directives) t.directives[e].onMount?.(t);\n\t\tt.effectMounts.forEach((e) => {\n\t\t\tt.effectUnmounts.push(e(t));\n\t\t});\n\t}';for(const x of [setup,before,after,mount,'un(() => t?.())'])if(!code.includes(x))throw Error('REACTIVE_SCOPE_PATCH_TARGET_MISMATCH');code=code.replace(setup,`function ad(e, t) {
const previousComponentTracker=Xu, previousDefineTracker=Zu, previousMountTracker=Qu, previousReactiveTracker=N.currentSubscriptionsTracker;
\tlet n`);code=code.replace(before,`N.currentSubscriptionsTracker = Xu;
\tlet a;
\ttry {
\t\ta = e(t);`);code=code.replace(after,'Xu = previousComponentTracker, Zu = previousDefineTracker, Qu = previousMountTracker, N.currentSubscriptionsTracker = previousReactiveTracker;');code=code.replace(mount,`function o(e,t,n) {
  const previousReactiveTracker=N.currentSubscriptionsTracker;
  N.currentSubscriptionsTracker=subscription=>{t.effectSubscriptions??=[];t.effectSubscriptions.push(subscription)};
  try {
    t.componentInstance.onMount?.(t,n);
    for(let key in t.directives)t.directives[key].onMount?.(t);
    t.effectMounts.forEach(callback=>t.effectUnmounts.push(callback(t)));
  } finally {N.currentSubscriptionsTracker=previousReactiveTracker}
}`);code=code.replace('un(() => t?.())','un(() => {if(typeof t==="function")t();else if(t&&typeof t.then==="function")void t.then(cleanup=>{if(typeof cleanup==="function")cleanup()})})');return{code,map:null}}}}
