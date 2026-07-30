import Image from "next/image";

const desktopHeroPath = "/media/ygf-authentic-hero-desktop-v2.jpg";
const mobileHeroPath = "/media/ygf-authentic-hero-mobile-v2.jpg";

export function HeroMedia({
  imageAlt,
}: Readonly<{
  imageAlt: string;
}>) {
  return (
    <div
      className="marketing-hero__media"
      data-hero-media-state="still"
    >
      <picture className="marketing-hero__picture">
        <source
          media="(max-width: 820px)"
          srcSet={mobileHeroPath}
          type="image/jpeg"
        />
        <Image
          alt={imageAlt}
          className="marketing-hero__poster"
          fetchPriority="high"
          fill
          loading="eager"
          sizes="100vw"
          src={desktopHeroPath}
          unoptimized
        />
      </picture>
    </div>
  );
}
