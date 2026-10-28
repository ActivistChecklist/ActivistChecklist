import { describe, it, expect } from 'vitest';
import { headingAnchorId, assignHeadingIds } from '@/lib/heading-anchor';

describe('headingAnchorId', () => {
  it('keeps the ASCII slug for Latin-script headings', () => {
    expect(headingAnchorId('Downsides to using a VPN')).toBe('downsides-to-using-a-vpn');
    expect(headingAnchorId('What is Signal?')).toBe('what-is-signal');
  });

  it('keeps existing accented-language anchors unchanged', () => {
    // These ids are already live on /es/, /fr/ and /it/, so the lossy
    // accent handling (and the leading hyphen) must not change.
    expect(headingAnchorId('Qué hacer')).toBe('qu-hacer');
    expect(headingAnchorId('¿Qué es una VPN?')).toBe('-qu-es-una-vpn');
    expect(headingAnchorId('Sécurité du téléphone')).toBe('s-curit-du-t-l-phone');
  });

  it('keeps Japanese text instead of dropping it', () => {
    expect(headingAnchorId('パスワードマネージャー')).toBe('パスワードマネージャー');
    expect(headingAnchorId('VPNの使い方')).toBe('vpnの使い方');
    expect(headingAnchorId('Signal を設定する')).toBe('signal-を設定する');
  });

  it('turns Japanese punctuation into separators', () => {
    expect(headingAnchorId('よくある質問：VPNとは？')).toBe('よくある質問-vpnとは');
    expect(headingAnchorId('「安全」な設定')).toBe('安全-な設定');
  });

  it('keeps Arabic text, including combining marks', () => {
    expect(headingAnchorId('استخدام VPN')).toBe('استخدام-vpn');
    expect(headingAnchorId('مُهِمّ')).toBe('مُهِمّ');
  });

  it('returns an empty string when there is nothing to keep', () => {
    expect(headingAnchorId('')).toBe('');
    expect(headingAnchorId('🔒 !!')).toBe('');
    expect(headingAnchorId(undefined)).toBe('');
  });
});

describe('assignHeadingIds', () => {
  it('keeps ids headings already have', () => {
    expect(assignHeadingIds([{ id: 'downsides', text: 'デメリット' }])).toEqual(['downsides']);
  });

  it('suffixes repeated generated ids', () => {
    expect(
      assignHeadingIds([{ text: 'VPNの使い方' }, { text: 'VPNの使い方' }, { text: 'VPNの使い方' }]),
    ).toEqual(['vpnの使い方', 'vpnの使い方-2', 'vpnの使い方-3']);
  });

  it('never reuses an existing id, even one that comes later on the page', () => {
    expect(assignHeadingIds([{ text: 'Setup' }, { id: 'setup', text: 'Setup' }])).toEqual([
      'setup-2',
      'setup',
    ]);
  });

  it('falls back to the heading position when the text has no letters or digits', () => {
    expect(assignHeadingIds([{ text: 'Intro' }, { text: '🔒' }])).toEqual(['intro', 'section-2']);
  });
});
