import React from 'react';
import { cn } from '@/lib/utils';

/**
 * VideoEmbed — <VideoEmbed src="/path/to/video.mp4">Caption text</VideoEmbed>
 */
export const VideoEmbed = ({
  src,
  children,
  className,
  controls = true,
  autoplay = false,
  loop = false,
  muted = false,
  ...props
}) => {
  if (!src) {
    console.warn('VideoEmbed: No video URL provided');
    return null;
  }

  return (
    <div className={cn('my-4 flex flex-col items-center', className)} {...props}>
      <video
        controls={controls}
        autoPlay={autoplay}
        loop={loop}
        muted={muted}
        className="max-w-full h-auto max-h-[70vh] rounded-lg shadow-xs"
        preload="metadata"
      >
        <source src={src} type="video/mp4" />
        Your browser does not support the video tag.
      </video>
      {children && <div className="mt-2 text-center max-w-full muted-links">{children}</div>}
    </div>
  );
};

export default VideoEmbed;
