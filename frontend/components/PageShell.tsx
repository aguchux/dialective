export function PageShell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-[1120px] p-5 md:p-8">{children}</main>;
}

export function Section({ children }: { children: React.ReactNode }) {
  return <section className="grid gap-4 pt-8 first:pt-0">{children}</section>;
}

export function PromptPreview({ children }: { children: React.ReactNode }) {
  return <blockquote className="grid gap-2.5 rounded-lg bg-surface-muted p-4">{children}</blockquote>;
}
