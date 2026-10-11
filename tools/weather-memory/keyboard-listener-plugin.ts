/** Preserve listener identity: anonymous remove callbacks do not remove the
 * previously registered KeyboardControls callbacks in CanvasEngine2.2.0. */
export function keyboardListenerPlugin(){return{name:'isolated-keyboard-listener-identity',enforce:'pre' as const,transform(code:string,id:string){if(!id.endsWith('/canvasengine/dist/index.js'))return null;const setup='setupListeners() {\n\t\tdocument.addEventListener("keydown", (e) => {\n\t\t\tthis.onKeyChange(e, !0);\n\t\t}), document.addEventListener("keyup", (e) => {\n\t\t\tthis.onKeyChange(e, !1);\n\t\t});\n\t}';const cleanup='cleanup() {\n\t\tdocument.removeEventListener("keydown", (e) => {\n\t\t\tthis.onKeyChange(e, !0);\n\t\t}), document.removeEventListener("keyup", (e) => {\n\t\t\tthis.onKeyChange(e, !1);\n\t\t});\n\t}';if(!code.includes(setup)||!code.includes(cleanup))throw Error('KEYBOARD_LISTENER_PATCH_TARGET_MISMATCH');code=code.replace(setup,`setupListeners() {
  this._harborKeyDown ??= event=>this.onKeyChange(event,true);
  this._harborKeyUp ??= event=>this.onKeyChange(event,false);
  document.addEventListener('keydown',this._harborKeyDown);
  document.addEventListener('keyup',this._harborKeyUp);
}`);code=code.replace(cleanup,`cleanup() {
  if(this._harborKeyDown)document.removeEventListener('keydown',this._harborKeyDown);
  if(this._harborKeyUp)document.removeEventListener('keyup',this._harborKeyUp);
}`);return{code,map:null}}}}
