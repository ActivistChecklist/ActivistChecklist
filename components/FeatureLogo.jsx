import Image from 'next/image';

export default function FeatureLogo({ logo }) {
  const { light, dark, height, width } = logo.image;
  const imageProps = { title: logo.name, alt: logo.name, height, width };

  // If a logo has a dark variant, render both and let the `dark` class pick one.
  // Choosing via useTheme() mismatches the server HTML on hydration, and React
  // leaves the light src in place for dark-mode visitors.
  const image = dark ? (
    <>
      <Image {...imageProps} src={light} className="dark:hidden" />
      <Image {...imageProps} src={dark} className="hidden dark:block" />
    </>
  ) : (
    <Image {...imageProps} src={light} />
  );

  // url is optional: some orgs are listed without linking to a specific page
  return (
    <div className='flex justify-center items-center py-3 md:py-2'>
      {logo.url ? <a href={logo.url} target="_blank">{image}</a> : image}
    </div>
  );
};
