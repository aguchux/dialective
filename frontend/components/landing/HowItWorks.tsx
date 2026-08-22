import { howItWorksSteps } from './data';

export function HowItWorks() {
  return (
    <section
      className="mx-auto grid max-w-280 gap-6 py-8 pb-9"
      aria-labelledby="how-it-works-title"
    >
      <h2 id="how-it-works-title" className="text-center text-2xl font-black md:text-[2rem]">
        How it works
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {howItWorksSteps.map((step, index) => (
          <div
            className="grid gap-2 rounded-lg border border-[rgba(5,5,5,0.1)] bg-white/70 p-5 backdrop-blur-sm"
            key={step.title}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent font-black text-white">
              {index + 1}
            </div>
            <h3 className="text-lg font-extrabold">{step.title}</h3>
            <p className="leading-snug text-[rgba(5,5,5,0.68)]">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
