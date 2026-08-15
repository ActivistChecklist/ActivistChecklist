import React from 'react';
import Image from 'next/image';
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import Link from "@/components/Link";

/**
 * ImageEmbed — <ImageEmbed src="/path/to/img.jpg" alt="...">Caption text</ImageEmbed>
 *              <ImageEmbed src="..." alt="..." link="/some/path" />
 *              <ImageEmbed src="..." alt="..." raw />  // no styling, intrinsic size
 */
export const ImageEmbed = ({
  src,
  alt,
  children,
  size = 'medium',
  alignment = 'center',
  link,
  raw = false,
  className,
  ...props
}) => {
  const isMobile = useIsMobile();

  if (!src) {
    console.warn('ImageEmbed: No image URL provided');
    return null;
  }

  // Raw mode: plain <img>, no wrapper styling, no caption block, intrinsic size.
  if (raw) {
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt || ''} loading="lazy" className={className} {...props} />
    );
    return link ? (
      <Link href={typeof link === 'string' ? link : '#'}>{img}</Link>
    ) : img;
  }

  const isNatural = size === 'natural';

  const getSizeClass = () => {
    switch (size) {
      case 'xs':      return 'max-w-48 sm:max-w-[16rem]';
      case 'small':   return 'max-w-xs sm:max-w-sm';
      case 'medium':  return 'max-w-sm sm:max-w-md';
      case 'large':   return 'max-w-md sm:max-w-2xl';
      case 'full':    return 'max-w-full';
      case 'natural': return '';
      default:        return 'max-w-sm sm:max-w-md';
    }
  };

  const getAlignmentClass = () => {
    if (isMobile) return 'mx-auto block';
    switch (alignment) {
      case 'left':  return 'float-left mr-6 mb-4 mt-2';
      case 'right': return 'float-right ml-6 mb-4 mt-2';
      case 'full':  return 'w-full block';
      default:      return 'mx-auto block';
    }
  };

  const imageElement = isNatural ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt || 'Embedded image'}
      loading="lazy"
      className={cn('rounded-lg shadow-xs', getAlignmentClass())}
      {...props}
    />
  ) : (
    <Image
      src={src}
      alt={alt || 'Embedded image'}
      width={800}
      height={600}
      className={cn('rounded-lg shadow-xs w-full h-auto', getSizeClass(), getAlignmentClass())}
      loading="lazy"
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      {...props}
    />
  );

  const wrappedImage = link ? (
    <Link href={typeof link === 'string' ? link : '#'} className="block">
      {imageElement}
    </Link>
  ) : imageElement;

  const captionClasses =
    'mt-2 block w-full max-w-full text-center text-sm text-muted-foreground prose-sm max-w-none muted-links px-2 sm:px-0';

  if (alignment === 'left' || alignment === 'right') {
    return (
      <>
        {wrappedImage}
        {children ? <span className={captionClasses}>{children}</span> : null}
      </>
    );
  }

  return (
    <span className={cn('my-4 block', className)}>
      {wrappedImage}
      {children ? <span className={captionClasses}>{children}</span> : null}
    </span>
  );
};

export default ImageEmbed;