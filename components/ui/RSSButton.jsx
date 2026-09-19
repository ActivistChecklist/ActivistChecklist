import React from 'react';
import { cn } from '@/lib/utils';
import { IoLogoRss } from 'react-icons/io5';
import Link from 'next/link';

/** Uses `next/link` on purpose: feeds are static at `/rss/*.xml` (root only). Locale-aware Link would rewrite to `/es/rss/…` and 404. */
const RSSButton = ({ 
  href, 
  className, 
  variant = 'default',
  size = 'default',
  children,
  ...props 
}) => {
  const baseClasses =
    'inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background';
  
  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-input hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    link: 'underline-offset-4 hover:underline text-primary'
  };
  
  const sizes = {
    default: 'h-10 py-2 px-4',
    sm: 'h-9 px-3 rounded-md',
    lg: 'h-11 px-8 rounded-md',
    icon: 'h-10 w-10'
  };
  
  return (
    <Link
      href={href}
      className={cn(
        baseClasses,
        variants[variant],
        sizes[size],
        className
      )}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      <IoLogoRss className="w-4 h-4 mr-2" />
      {'RSS Feed'}
    </Link>
  );
};

export default RSSButton;
