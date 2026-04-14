import { isUsTimezone } from '../lib/us-timezone';

describe('isUsTimezone', () => {
  test.each([
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
  ])('returns true for US zone %s', (tz) => {
    expect(isUsTimezone(tz)).toBe(true);
  });

  test.each([
    'America/Indiana/Indianapolis',
    'America/Indiana/Knox',
    'America/Indiana/Marengo',
    'America/Indiana/Petersburg',
    'America/Indiana/Tell_City',
    'America/Indiana/Vevay',
    'America/Indiana/Vincennes',
    'America/Indiana/Winamac',
    'America/Kentucky/Louisville',
    'America/Kentucky/Monticello',
    'America/North_Dakota/Beulah',
    'America/North_Dakota/Center',
    'America/North_Dakota/New_Salem',
  ])('returns true for multi-zone US state %s', (tz) => {
    expect(isUsTimezone(tz)).toBe(true);
  });

  test.each([
    'America/Toronto',
    'America/Vancouver',
    'America/Mexico_City',
    'America/Sao_Paulo',
    'America/Argentina/Buenos_Aires',
    'Europe/London',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Australia/Sydney',
    'Africa/Cairo',
    'Pacific/Auckland',
    'Pacific/Fiji',
  ])('returns false for non-US zone %s', (tz) => {
    expect(isUsTimezone(tz)).toBe(false);
  });

  test.each([undefined, null, '', 0, {}, []])('returns false for invalid input %p', (tz) => {
    expect(isUsTimezone(tz)).toBe(false);
  });
});
