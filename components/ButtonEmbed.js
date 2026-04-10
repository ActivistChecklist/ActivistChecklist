import React from 'react';
import { Button } from "@/components/ui/button";
import { IoCloudDownloadOutline, IoDocumentsOutline, IoOpenOutline } from 'react-icons/io5';
import Link from '@/components/Link';
import { trackFileDownload } from '@/lib/download-tracker';

// Static registry of icons used in content. Add new icons here as needed.
const ICON_REGISTRY = {
  IoCloudDownloadOutline,
  IoDocumentsOutline,
  IoOpenOutline,
};

// Icon renderer — looks up from static registry to avoid importing all icons
const DynamicIcon = ({ iconName, className, ...props }) => {
  if (!iconName) return null;
  const formattedIconName = iconName.startsWith('Io') ? iconName : `Io${iconName}`;
  const IconComponent = ICON_REGISTRY[formattedIconName];
  if (!IconComponent) {
    console.warn(`Icon "${formattedIconName}" not in ButtonEmbed registry. Add it to ICON_REGISTRY in ButtonEmbed.js`);
    return null;
  }
  return <IconComponent className={className} {...props} />;
};

export const ButtonEmbed = (props) => {
  const {
    title,
    href: hrefProp,
    url: urlLegacy,
    variant,
    size,
    className,
    icon,
    iconPosition,
    download,
    alignment,
    target: targetProp,
  } = props;

  const raw =
    (typeof hrefProp === 'string' ? hrefProp : null) ??
    (typeof urlLegacy === 'string' ? urlLegacy : null);
  const href = raw || '#';

  const iconElement = icon ? <DynamicIcon iconName={icon} /> : null;
  const position = iconPosition || 'left';
  
  // Handle alignment classes for the container
  const getAlignmentClass = () => {
    switch (alignment) {
      case 'left':
        return 'flex justify-start';
      case 'center':
        return 'flex justify-center';
      case 'right':
        return 'flex justify-end';
      default:
        return 'flex justify-start'; // default to left alignment
    }
  };

   // Handle download tracking
   const handleClick = async (e) => {
    if (download && title) {
      await trackFileDownload(title);
    }
  };
  
  const inner = (
    <>
      {iconElement && position === 'left' && iconElement}
      {title}
      {iconElement && position === 'right' && iconElement}
    </>
  );

  return (
    <div className={getAlignmentClass()}>
      <Button
        asChild
        variant={variant || 'default'}
        size={size || 'default'}
        className={className}
      >
        <Link
          href={href}
          onClick={handleClick}
          {...(targetProp ? { target: targetProp } : {})}
          {...(download && { download: '' })}
        >
          {inner}
        </Link>
      </Button>
    </div>
  );
};

export default ButtonEmbed;
