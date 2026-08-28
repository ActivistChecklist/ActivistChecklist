'use client';
import { sendAnalytics as sendAnalyticsRaw, initializeOnLoad as initializeOnLoadRaw } from '@activistchecklist/umami-extra-privacy/client';
import { debugLog } from '@/contexts/DebugContext';
import { isProd } from '@/utils/core';

export const sendAnalytics = async (data = {}, endpoint = '/api-server/counter') => {
  const DEBUG_MODE = process.env.NEXT_PUBLIC_DEBUG_COUNTER === 'true';
  if (!isProd && !DEBUG_MODE) {
    return;
  }
  debugLog('sendAnalytics', data);
  return sendAnalyticsRaw(data, { endpoint });
};

export const initializeOnLoad = initializeOnLoadRaw;

export function useAnalytics() {
  const trackEvent = async ({ ...data }) => {
    await sendAnalytics(data);
  };

  return { trackEvent };
}
