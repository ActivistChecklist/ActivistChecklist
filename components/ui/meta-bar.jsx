'use client';
import { cn, formatContentDate } from "@/lib/utils";
import { Calendar } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

export function getDateMetaItem(date, label = "Last updated on", dateLocale = 'en-US') {
  return {
    icon: <Calendar className="h-4 w-4 mr-1" />,
    label,
    value: formatContentDate(date, dateLocale),
  };
}

export const MetaBar = ({ 
  items = [],
  className,
  ...props 
}) => {
  const t = useTranslations();
  if (items.length === 0) return null;
  
  const valueStyle = "text-foreground font-semibold"; 
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, []);

  return (
    <div className={cn(
      "bg-muted rounded-md lg:rounded-2xl py-3 px-6 mb-6 flex flex-wrap items-center", 
      "gap-y-2 gap-x-6 text-sm text-muted-foreground",
      "print:mb-0",
      className
    )}
    data-pagefind-ignore
    {...props}
    >
      {items.map((item, index) => (
        <div key={index} className="flex items-center whitespace-nowrap">
          {item.icon && (
            <>
              {item.icon}
              &nbsp;
            </>
          )}
          <span>
            {item.label}&nbsp;
            <span className={valueStyle}>
              {item.value}
            </span>
          </span>
        </div>
      ))}
      <div className="hidden print:flex whitespace-normal">
        <span>
          {t('meta.viewLatestGuideAt')}{' '}
          <span className={valueStyle}>
            {currentUrl}
          </span>
        </span>
      </div>
    </div>
  );
}; 