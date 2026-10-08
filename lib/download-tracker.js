import { sendAnalytics } from '@/hooks/use-analytics';

/**
 * Tracks file downloads by sending a ping to the analytics endpoint
 * @param {string} fileName - The name/title of the file being downloaded
 * @param {Object} additionalData - Additional data to include in the tracking event
 */
export const trackFileDownload = async (fileName, additionalData = {}) => {
  await sendAnalytics({
    name: 'file_downloaded',
    data: {
      file_name: fileName,
      ...additionalData,
    },
  });
};
