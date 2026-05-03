/**
 * Sub-category drill-down for the four top-level platform buttons. Picking a sub-
 * category sets a `priorityProductIds` set used by the autocomplete to boost matches
 * (we no longer hard-filter — the user can still find anything by typing it).
 *
 * `productIds` enumerates which snapshot products map to that sub-category.
 */

const APPLE_SUB_CATEGORIES = [
  { id: 'iphone',      labelKey: 'iphone',      family: 'apple',     productIds: ['iphone', 'ios'] },
  { id: 'ipad',        labelKey: 'ipad',        family: 'apple',     productIds: ['ipad', 'ipados'] },
  { id: 'apple-watch', labelKey: 'appleWatch',  family: 'apple',     productIds: ['apple-watch'] },
  { id: 'mac',         labelKey: 'mac',         family: 'apple',     productIds: ['macbook-pro', 'macbook-air', 'mac-mini', 'imac', 'imac-pro', 'mac-studio', 'mac-pro', 'macos'] },
];

const ANDROID_SUB_CATEGORIES = [
  { id: 'samsung',  labelKey: 'samsung',  family: 'samsung',  productIds: ['samsung-mobile', 'samsung-galaxy-tab', 'samsung-galaxy-watch'] },
  { id: 'pixel',    labelKey: 'pixel',    family: 'google',   productIds: ['pixel', 'pixel-watch'] },
  { id: 'motorola', labelKey: 'motorola', family: 'motorola', productIds: ['motorola-mobility'] },
  { id: 'oneplus',  labelKey: 'oneplus',  family: 'oneplus',  productIds: ['oneplus'] },
  { id: 'nokia',    labelKey: 'nokia',    family: 'nokia',    productIds: ['nokia'] },
  { id: 'android',  labelKey: 'androidOs', family: 'google',  productIds: ['android'] },
];

// Windows skips the L2 step — there's only one option and it's the OS itself.
const WINDOWS_LEAF = { id: 'windows', labelKey: 'windows', family: 'microsoft', productIds: ['windows'] };

export const SUB_CATEGORIES_BY_PLATFORM = {
  apple: APPLE_SUB_CATEGORIES,
  android: ANDROID_SUB_CATEGORIES,
  windows: [WINDOWS_LEAF], // single auto-selected leaf
  other: [], // no sub-categories — info panel only
};

/** A leaf node: pre-selected via the platform button without a real L2 choice. */
export function leafForPlatform(platform) {
  if (platform === 'windows') return WINDOWS_LEAF;
  return null;
}
