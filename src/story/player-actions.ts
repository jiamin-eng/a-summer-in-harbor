/**
 * Actions the game page can send right now.
 * Labels and action ids come from the same modules the page uses.
 */
import type { Point } from '../engine/world';
import { shoreTap } from '../challenges/fishing-tap';
import {
  fishingBackLabel,
  fishingCastLabel,
  fishingConfirmLabel,
  fishingHookLabel,
  fishingKitClaimLabel,
  fishingLeaveLabel,
  fishingMissLabel,
  hasFishingKit,
} from '../challenges/shore-fishing';
import { FISHING_NEW_STARTS } from '../fishing-release';
import { landWorld } from '../life/land';
import { shoreReasons } from '../ui/ShoreFishingAccess';
import { checkShore, shoreWaterCells } from '../world/shore-water';
import { people, rooms, worldWithFlags, type Entity, type Words } from '../world/data';
import { presentEntity } from '../world/residents';
import { actionLabels } from './action-labels';
import { chapelActionAvailable } from './chapel';
import { cropChoices, plotIds } from './crops';
import { neighborActionAvailable, neighborActionLabels } from './neighbor-chapter';
import { growthObservations } from './relationship-growth';
import { availableTopics, has, type Save } from './state';

export type OfferedAction = {
  label: Words;
  action: string;
  target: string;
  position: Point;
  payload?: unknown;
  destination?: string;
  needsHookTick?: boolean;
  /** Miss the bite: the caller passes hookTick null. */
  passHookTick?: null;
};

export type SceneOffers = {
  actions: OfferedAction[];
  notes: Words[];
};

const buttonToEngine: Record<string, string> = {
  'repair-terrace': 'challenge-start:repair',
  'assemble-map': 'challenge-start:map',
};

/** The action string the page sends for an entity button. */
export function engineAction(id: string): string {
  return buttonToEngine[id] ?? id;
}

function observation(save: Save, entityId: string) {
  const room = save.fieldNotes?.rooms.find((item) => item.id === save.scene);
  const index = ['observation-a', 'observation-b'].indexOf(entityId);
  return index >= 0 ? room?.observations[index] : undefined;
}

/** Same gate the entity panel uses before showing a button. */
export function entityButtonOpen(save: Save, entityId: string, id: string): boolean {
  if (!neighborActionAvailable(save, id) || !chapelActionAvailable(save, id)) return false;
  if (id === 'notes-observe' && observation(save, entityId)?.read) return false;
  if (id === 'open-market' && !(has(save, 'market-known') && has(save, 'route-open'))) return false;
  if (id === 'repair-bridge' && !has(save, 'bridge-seen')) return false;
  if (id === 'rest' || id === 'sleep') return true;
  if (has(save, id)) return false;
  if (id === 'unpack' && has(save, 'unpacked')) return false;
  if (id === 'repair-terrace' && has(save, 'terrace-fixed')) return false;
  if (id === 'assemble-map' && has(save, 'alternative-route')) return false;
  return true;
}

function buttonLabel(save: Save, entityId: string, id: string): Words {
  if (id === 'notes-observe') {
    const note = observation(save, entityId);
    if (note) return note.label;
  }
  return neighborActionLabels[id] ?? actionLabels[id] ?? [id, id];
}

function at(entity: Entity): Point {
  return { ...(entity.approach ?? entity.at) };
}

function stand(save: Save): Point {
  return { ...save.position };
}

function fail(code: string, words: Words): never {
  throw Object.assign(new Error(code), { words });
}

export const offerErrors: Record<string, Words> = {
  ACTION_UNAVAILABLE: ['这个动作现在不能做。', 'That action is not available now.'],
};

function hookWords(save: Save): Words {
  const active = save.activeChallenge?.kind === 'fishing' ? save.activeChallenge : undefined;
  const bite = active?.fishing?.biteTick ?? active?.fishingTap?.biteTick;
  if (bite === undefined) return ['把提竿的拍数传到 hookTick。', 'Pass hookTick for the hook.'];
  return [`把提竿的拍数传到 hookTick。浮漂在第 ${bite} 拍下沉。`, `Pass hookTick. The float dips at tick ${bite}.`];
}

function fishingOffers(save: Save, notes: Words[]): OfferedAction[] {
  const here = stand(save);
  const active = save.activeChallenge?.kind === 'fishing' ? save.activeChallenge : undefined;
  if (active) {
    if (active.fishingPending) {
      const back = active.fishingPending.result !== 'caught';
      return [{
        label: back ? fishingBackLabel : fishingConfirmLabel,
        action: 'fishing:confirm',
        target: active.id,
        position: here,
      }];
    }
    const bite = active.fishing?.biteTick ?? active.fishingTap?.biteTick;
    const span = active.fishing?.hookWindow ?? active.fishingTap?.hookWindow;
    const offers: OfferedAction[] = [];
    if (bite !== undefined && span !== undefined) {
      notes.push([
        `浮漂在第 ${bite} 拍下沉，咬钩窗口 ${span} 拍。`,
        `The float dips at tick ${bite}. The bite window is ${span} ticks.`,
      ]);
      offers.push({
        label: fishingHookLabel,
        action: 'fishing:land',
        target: active.id,
        position: here,
        needsHookTick: true,
      });
      offers.push({
        label: fishingMissLabel,
        action: 'fishing:land',
        target: active.id,
        position: here,
        payload: { shore: shoreTap({ biteTick: bite, hookWindow: span }, null) },
        passHookTick: null,
      });
    }
    offers.push({
      label: fishingLeaveLabel,
      action: 'fishing:withdraw',
      target: active.id,
      position: here,
    });
    return offers;
  }
  if (save.activeChallenge || !FISHING_NEW_STARTS) return [];
  if (!hasFishingKit(save)) {
    return [{
      label: fishingKitClaimLabel,
      action: 'fishing-kit:claim',
      target: 'fishing-kit',
      position: here,
    }];
  }
  if (!shoreWaterCells(save.scene).length) return [];
  const shore = checkShore(save.scene, save.position, landWorld(worldWithFlags(save.flags), save.landV1));
  if (!shore.ok) {
    notes.push(shoreReasons[shore.reason]);
    return [];
  }
  return [{
    label: fishingCastLabel,
    action: 'fishing:start',
    target: 'shore-water',
    position: here,
    payload: { cast: shore.target.at },
  }];
}

function pushGrowth(actions: OfferedAction[], save: Save, entity: Entity) {
  for (const option of growthObservations(save, entity.id)) {
    actions.push({
      label: option.label,
      action: option.action,
      target: entity.id,
      position: at(entity),
    });
  }
}

export function sceneOffers(save: Save): SceneOffers {
  const notes: Words[] = [];
  const fishing = fishingOffers(save, notes);
  if (save.activeChallenge?.kind === 'fishing') return { actions: fishing, notes };
  const actions: OfferedAction[] = [];
  const room = rooms[save.scene];
  if (room) {
    for (const entity of room.entities) {
      if (!presentEntity(save, entity)) continue;
      if (entity.kind === 'person' && entity.person && people[entity.person]) {
        const person = people[entity.person];
        if (!save.known.includes(entity.person)) {
          actions.push({
            label: [`向${person.unknown[0]}打招呼`, `Say hello to ${person.unknown[1]}`],
            action: 'introduce',
            target: entity.id,
            position: at(entity),
          });
        } else {
          const name = person.name;
          for (const topic of availableTopics(save, entity.person)) {
            actions.push({
              label: [`对${name[0]}说：${topic.label[0]}`, `Say to ${name[1]}: ${topic.label[1]}`],
              action: 'talk:' + topic.id,
              target: entity.id,
              position: at(entity),
            });
          }
        }
        pushGrowth(actions, save, entity);
      } else if (entity.kind === 'object') {
        if (plotIds.includes(entity.id) || entity.id === 'crop-counter') {
          for (const choice of cropChoices(save, entity.id)) {
            actions.push({
              label: choice.label,
              action: choice.id,
              target: entity.id,
              position: at(entity),
            });
          }
        } else {
          for (const id of entity.actions ?? []) {
            if (!entityButtonOpen(save, entity.id, id)) continue;
            actions.push({
              label: buttonLabel(save, entity.id, id),
              action: engineAction(id),
              target: entity.id,
              position: at(entity),
            });
          }
        }
        pushGrowth(actions, save, entity);
      } else if (entity.kind === 'portal' && entity.destination) {
        actions.push({
          label: entity.label,
          action: 'travel',
          target: entity.id,
          position: at(entity),
          destination: entity.destination,
        });
      }
    }
  }
  for (const id of save.visited) {
    if (id === save.scene || !rooms[id]) continue;
    actions.push({
      label: rooms[id].title,
      action: 'travel-map',
      target: id,
      position: stand(save),
      destination: id,
    });
  }
  actions.push(...fishing);
  return { actions, notes };
}

export function prepareOfferedAction(save: Save, action: string, target: string, hookTick?: number | null): OfferedAction {
  const matches = sceneOffers(save).actions.filter((item) => item.action === action && item.target === target);
  if (!matches.length) fail('ACTION_UNAVAILABLE', offerErrors.ACTION_UNAVAILABLE);
  const hook = matches.find((item) => item.needsHookTick);
  if (hook && hookTick !== undefined && hookTick !== null) {
    if (!Number.isSafeInteger(hookTick)) fail('HOOK_TICK_REQUIRED', hookWords(save));
    const active = save.activeChallenge?.kind === 'fishing' ? save.activeChallenge : undefined;
    const bite = active?.fishing?.biteTick ?? active?.fishingTap?.biteTick;
    const span = active?.fishing?.hookWindow ?? active?.fishingTap?.hookWindow;
    if (bite === undefined || span === undefined) fail('ACTION_UNAVAILABLE', offerErrors.ACTION_UNAVAILABLE);
    return { ...hook, needsHookTick: false, payload: { shore: shoreTap({ biteTick: bite, hookWindow: span }, hookTick) } };
  }
  if (hookTick === null) {
    const miss = matches.find((item) => item.passHookTick === null);
    if (miss) return miss;
    if (hook) fail('ACTION_UNAVAILABLE', offerErrors.ACTION_UNAVAILABLE);
  }
  if (hook) fail('HOOK_TICK_REQUIRED', hookWords(save));
  return matches[0];
}
