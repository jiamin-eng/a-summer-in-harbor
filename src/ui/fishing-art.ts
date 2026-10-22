/** Exact READY candidate bytes; local integration is not formal library admission. */
export const fishingItemImages:Readonly<Record<string,string>>={
 'basic-fishing-rod':new URL('./fishing-art/basic-fishing-rod.png',import.meta.url).href,
 'bait-worm':new URL('./fishing-art/bait-worm.png',import.meta.url).href,
 'bait-shrimp':new URL('./fishing-art/bait-shrimp.png',import.meta.url).href,
 'bait-fish-chunk':new URL('./fishing-art/bait-fish-chunk.png',import.meta.url).href,
};
// Deliberately no reusable-fishing-lure (HOLD), fish or species-image fallback.
