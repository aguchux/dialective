import Link from 'next/link';

export function LandingHero() {
  return (
    <section
      className="mx-auto grid max-w-[760px] gap-5 py-6 pb-9 text-center md:pt-[3.1rem]"
      aria-labelledby="landing-title"
    >
      <h1 id="landing-title" className="text-5xl font-black leading-[1.08] md:text-[4.1rem]">
        Become the voice that AI learns from
      </h1>
      <p className="text-lg font-medium leading-snug text-[rgba(5,5,5,0.68)] md:text-[1.34rem]">
        Contribute short recordings and word translations in your language or dialect. Work from your phone, wherever
        you are. No AI experience needed.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          className="inline-flex min-h-[42px] min-w-[190px] items-center justify-center justify-self-center whitespace-nowrap rounded-full border-[1.5px] border-accent bg-accent px-[1.15rem] py-[0.7rem] text-white no-underline transition-colors hover:border-accent-dark hover:bg-accent-dark"
          href="/register"
        >
          Start contributing
        </Link>
        <Link
          className="inline-flex min-h-[42px] min-w-[190px] items-center justify-center justify-self-center whitespace-nowrap rounded-full border-[1.5px] border-[#050505] bg-white px-[1.15rem] py-[0.7rem] text-[#050505] no-underline transition-colors hover:bg-[rgba(5,5,5,0.06)]"
          href="/data-access"
        >
          Subscribe to voice data
        </Link>
      </div>
    </section>
  );
}
