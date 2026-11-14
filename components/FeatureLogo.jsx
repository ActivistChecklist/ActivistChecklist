import Image from 'next/image';
import { cn } from '@/lib/utils';

// The homepage shows these in a single row. They range from wide wordmarks to
// square badges, so each is capped by height and width rather than set to one
// size.
const SIZE = 'h-auto max-h-14 w-auto max-w-full';

export default function FeatureLogo({ logo }) {
  const { light, dark, height, width } = logo.image;
  const imageProps = { title: logo.name, alt: logo.name, height, width };

  // If a logo has a dark variant, render both and let the `dark` class pick one.
  // Choosing via useTheme() mismatches the server HTML on hydration, and React
  // leaves the light src in place for dark-mode visitors.
  const image = dark ? (
    <>
      <Image {...imageProps} src={light} className={cn(SIZE, 'dark:hidden')} />
      <Image {...imageProps} src={dark} className={cn(SIZE, 'hidden dark:block')} />
    </>
  ) : (
    <Image {...imageProps} src={light} className={SIZE} />
  );

  // url is optional: some orgs are listed without linking to a specific page
  return (
    <div className="flex justify-center items-center py-1">
      {logo.url ? (
        <a href={logo.url} target="_blank">
          {image}
        </a>
      ) : (
        image
      )}
    </div>
  );
}
