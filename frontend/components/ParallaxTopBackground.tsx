interface ParallaxTopBackgroundProps {
  className?: string;
}

export function ParallaxTopBackground({ className = 'h-56 md:h-64' }: ParallaxTopBackgroundProps) {
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 top-0 z-0 bg-[#c9eff7] bg-cover bg-top bg-fixed bg-no-repeat ${className}`}
      style={{ backgroundImage: "url('/landing-hero.png')" }}
      aria-hidden="true"
    />
  );
}
