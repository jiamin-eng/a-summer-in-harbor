import { AsyncLocalStorage } from 'node:async_hooks';
import { applyAction, type Action, type Save } from '../../src/story/state.js';
import { worldWithFlags, type Words } from '../../src/world/data.js';

export type Performed = { head: Save; text: Words };

type Performer = (save: Save, action: Action) => Promise<Performed>;

const current = new AsyncLocalStorage<Performer>();

/** Copy the engine save over the working copy, including fields the engine removed. */
export function adoptSave(save: Save, head: Save) {
  for (const key of Object.keys(save)) {
    if (!(key in head)) delete (save as Record<string, unknown>)[key];
  }
  Object.assign(save, head);
}

/** Local play applies the story reducer. A bound game journey replaces this. */
export async function performAction(save: Save, action: Action): Promise<Performed> {
  const performer = current.getStore();
  if (performer) return performer(save, action);
  const result = applyAction(save, action, undefined, worldWithFlags(save.flags));
  adoptSave(save, result.head);
  return { head: result.head, text: result.text };
}

export function withPerformer<T>(performer: Performer, run: () => Promise<T>): Promise<T> {
  return current.run(performer, run);
}
