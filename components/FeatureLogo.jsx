'use client';

import { useTheme } from "next-themes";
import Image from 'next/image';

export default function FeatureLogo({ logo }) {
  
  // if a logo has a dark variant, use it in dark mode
  const { resolvedTheme } = useTheme();
  const themedImage = resolvedTheme === "dark" ? 
    logo.image.dark ? logo.image.dark : logo.image.light
    : logo.image.light;
  
  return (
    <div className='flex justify-center items-center py-3 md:py-2'>
      <a href={logo.url} target="_blank">
        <Image
          title={logo.name}
          alt={logo.name}
          src={themedImage}
          height={logo.image.height}
          width={logo.image.width}
        />
      </a>
    </div>
  );
};