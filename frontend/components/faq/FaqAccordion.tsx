import { faqItems } from './faq-data';

export function FaqAccordion() {
  return (
    <section className="grid gap-3" aria-label="Frequently asked questions">
      {faqItems.map((item, index) => (
        <details
          className="group rounded-lg border border-line bg-surface shadow-[0_10px_24px_rgba(27,31,27,0.06)]"
          key={item.question}
          open={index === 0}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-left font-extrabold marker:hidden">
            <span>{item.question}</span>
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-muted text-lg leading-none transition-transform group-open:rotate-45"
              aria-hidden="true"
            >
              +
            </span>
          </summary>
          <div className="border-t border-line px-4 py-4">
            <p className="leading-relaxed text-muted">{item.answer}</p>
          </div>
        </details>
      ))}
    </section>
  );
}
