/**
 * Sub-category drill-down for the four top-level platform buttons. Picking a sub-
 * category sets a `priorityProductIds` set used by the autocomplete to boost matches
 * (we no longer hard-filter — the user can still find anything by typing it).
 *
 * `productIds` enumerates which snapshot products map to that sub-category.
 */

// iPhone and iPad share the same find-model path (Settings > General > About > Model
// Name) and the same OS update story, so we collapse them into a single sub-category
// rather than asking the user to disambiguate. Mac covers desktops AND laptops; the
// label says "Mac / MacBook" so MacBook owners recognise the path. Order matches
// rough usage volume: phones/tablets first, computers second, watches last.
const APPLE_SUB_CATEGORIES = [
  { id: 'iphone-ipad', labelKey: 'iphoneIpad', family: 'apple', productIds: ['iphone', 'ios', 'ipad', 'ipados'] },
  { id: 'mac',         labelKey: 'mac',        family: 'apple', productIds: ['macbook-pro', 'macbook-air', 'mac-mini', 'imac', 'imac-pro', 'mac-studio', 'mac-pro', 'macos'] },
  { id: 'apple-watch', labelKey: 'appleWatch', family: 'apple', productIds: ['apple-watch'] },
];

// Android skips the L2 step too: across all the Android OEMs we'd otherwise list
// (Samsung, Pixel, Motorola, OnePlus, Nokia), the actually-useful question is the
// Android version, not which manufacturer made the phone. Pre-selecting the leaf
// jumps L1 → L3 with the "About phone → Android version" hint. The productIds list
// covers every Android-related entry in the snapshot so the autocomplete still
// boosts hardware matches when the user types a model name.
const ANDROID_LEAF = {
  id: 'android',
  labelKey: 'android',
  family: 'android',
  productIds: [
    'samsung-mobile', 'samsung-galaxy-tab', 'samsung-galaxy-watch',
    'pixel', 'pixel-watch',
    'motorola-mobility',
    'oneplus',
    'nokia',
    'android',
  ],
};

// Windows skips the L2 step — there's only one option and it's the OS itself.
const WINDOWS_LEAF = { id: 'windows', labelKey: 'windows', family: 'microsoft', productIds: ['windows'] };

export const SUB_CATEGORIES_BY_PLATFORM = {
  apple: APPLE_SUB_CATEGORIES,
  android: [ANDROID_LEAF], // single auto-selected leaf (was an OEM picker)
  windows: [WINDOWS_LEAF], // single auto-selected leaf
  other: [], // no sub-categories — info panel only
};

/** A leaf node: pre-selected via the platform button without a real L2 choice. */
export function leafForPlatform(platform) {
  if (platform === 'android') return ANDROID_LEAF;
  if (platform === 'windows') return WINDOWS_LEAF;
  return null;
}
