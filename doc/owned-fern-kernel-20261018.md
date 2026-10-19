# Owned fern kernel — local candidate

Base: published `4da1808c009a2345614e82dee65a5ccccaa3c2ad`. This module is deliberately absent from `server/public.ts`, Main, View, LifeBag and every normal action parser. No real journey can receive or move a fern from this commit alone.

`ownedFernV1` is an optional, strictly checked, **fixture-only** save root. It has one instance and one holder (`bag` or abstract `room-pot-1`), a source action, journey owner, acquisition minute and age at acquisition. A move changes the holder of that same instance and records its action/minute; it does not create an item, collectible, sale or second plant. The core clones before mutation and rejects a stale version, wrong owner, missing room access, challenge, moving-clock checkpoint, repeated action or untrusted slot admission. The caller must obtain real spatial admission and commit through the existing authority CAS/event/receipt transaction. The QA-only host proves that transaction, including rollback, replay, restart and account isolation.

The fixture source is not a player gift. There is no grant function, player action, room prop, plant art, bag image, rule cost or time advance in this candidate. The public garden `growing-fern` and the static rented-room `home/fern` prop remain unchanged. The current room prop resolves to `flora-pot-rubber-v1`; it is scenery, not a source or an empty interactive slot. The plant's `ageMinutesAtGrant` is carried unchanged on moves; no new growth policy is claimed.

## Content proposal for main review, not adopted here

- **Gift:** after the player unpacks, Mara could offer one *separately owned* potted fern cutting in an explicit optional conversation. Acceptance would create one stable source event and instance per journey. It must not extract the public garden fern or convert the existing room scenery into player property. Mara, the event, and the source wording are a recommendation; the original plan did not fix them.
- **Pot:** add a distinct room target near the reading shelf. A static candidate is `home` at `(670,350)`, approach `(662,378)`, 16×12 footprint. The current world reports the approach walkable with a 28-step path from room spawn. Real renderer, overlap, mobile touch and final spatial binding are not yet checked; this is not an admitted coordinate.
- **Move cost:** the planning case suggests 4 energy, 20 game minutes and $0. It is a proposal, not implemented here. The main review should choose the final cost before any visible action.

Before production admission, add the selected authored source and strict source version, real slot entity/rendering, proximity and room-access proof, finalized atomic cost, LifeBag/state projection, and latest Main/View plus save/phone QA. Do not treat the passing fixture as that admission. Finite basil regrowth is a separate later candidate with unset harvest and wetness limits.

Validation: 25/25 targeted new and existing basil/seed-quota tests, TypeScript and `npm run build` passed. No shared browser, remote service, Library resource, paid model, installed dependency, real save or production write was used.
