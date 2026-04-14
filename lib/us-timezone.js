export const NON_US_NOTICE_STORAGE_KEY = 'non-us-notice-dismissed';

const US_TIMEZONES_EXACT = new Set([
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Phoenix',
  'America/Adak',
  'America/Boise',
  'America/Detroit',
  'America/Menominee',
  'America/Juneau',
  'America/Metlakatla',
  'America/Nome',
  'America/Sitka',
  'America/Yakutat',
  'Pacific/Honolulu',
  'America/Puerto_Rico',
  'America/St_Thomas',
  'Pacific/Guam',
  'Pacific/Saipan',
  'Pacific/Pago_Pago',
]);

const US_TIMEZONE_PREFIXES = [
  'America/Indiana/',
  'America/Kentucky/',
  'America/North_Dakota/',
];

export function isUsTimezone(tz) {
  if (typeof tz !== 'string' || tz.length === 0) return false;
  if (US_TIMEZONES_EXACT.has(tz)) return true;
  return US_TIMEZONE_PREFIXES.some((prefix) => tz.startsWith(prefix));
}

export function detectBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}
