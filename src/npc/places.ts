export type TownPlace = { scene: string; title: [string, string]; at: { x: number; y: number } };

let scenes: TownPlace[] = [];

/** Filled once the town map has finished building its rooms. */
export function registerTownScenes(next: TownPlace[]) {
  scenes = next.map((place) => ({ scene: place.scene, title: [...place.title], at: { ...place.at } }));
}

export function townScenes() {
  return scenes;
}
