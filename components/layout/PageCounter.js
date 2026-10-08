'use client';
import { useEffect } from 'react';
import { sendAnalytics, initializeOnLoad } from '@/hooks/use-analytics';

const PageCounter = () => {
  useEffect(() => {
    const sendPageView = async () => {
      await sendAnalytics();
    };

    return initializeOnLoad(sendPageView);
  }, []); // Run once when component mounts

  return null; // This component doesn't render anything
};

export default PageCounter;
