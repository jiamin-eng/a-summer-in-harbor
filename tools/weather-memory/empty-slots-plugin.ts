/** QA-only dependency transform. Empty optional server component slots allocate
 * no nested component tree; conditional subscriptions retain later payloads. */
export function emptySlotsPlugin(){return{name:'isolated-lazy-empty-character-slots',enforce:'pre' as const,transform(code:string,id:string){if(!id.endsWith('/@rpgjs/client/dist/components/character.ce.js'))return null;const anchor='const sprite = object();';if(!code.includes(anchor))throw Error('CHARACTER_PATCH_TARGET_MISMATCH');code=code.replace(anchor,`${anchor}
const hasSlotContent = value => {
  if (!value) return false;
  if (typeof value === 'string') {try {value=JSON.parse(value)} catch {return true}}
  return !Array.isArray(value?.components) || value.components.length > 0;
};`);for(const position of ['bottom','left','center','right','top']){const slot=`h(__ce_component$1, {\n\t\t\tobject: sprite,\n\t\t\tposition: "${position}",\n\t\t\tgraphicBounds\n\t\t})`;if(!code.includes(slot))throw Error('CHARACTER_SLOT_PATCH_TARGET_MISMATCH:'+position);const field='components'+position[0].toUpperCase()+position.slice(1);code=code.replace(slot,`cond(() => hasSlotContent(sprite.${field}?.()), () => ${slot})`)}return{code,map:null}}}}
