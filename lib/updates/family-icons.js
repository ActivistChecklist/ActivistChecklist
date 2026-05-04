/**
 * Brand icons used by the autocomplete row icon and family/sub-category cards.
 * Always picks the most specific brand we have an icon for. (Pixel falls back to
 * Google's logo since simple-icons doesn't ship a dedicated Pixel mark.)
 */

import { SiApple, SiSamsung, SiGoogle, SiMotorola, SiOneplus, SiNokia } from 'react-icons/si';
import { FaWindows, FaAndroid } from 'react-icons/fa6';
import { Smartphone } from 'lucide-react';

export const BRAND_ICON = {
  apple: SiApple,
  android: FaAndroid,
  google: SiGoogle,
  samsung: SiSamsung,
  microsoft: FaWindows,
  motorola: SiMotorola,
  oneplus: SiOneplus,
  nokia: SiNokia,
};

export const PLATFORM_GROUP_ICON = {
  apple: SiApple,
  android: FaAndroid,
  windows: FaWindows,
  other: Smartphone,
};

/** Icon for a snapshot row. Falls back to a generic Smartphone icon. */
export function iconForFamily(family) {
  return BRAND_ICON[family] || Smartphone;
}
