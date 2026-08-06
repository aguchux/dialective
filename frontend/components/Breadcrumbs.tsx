import Link from 'next/link';

interface BreadcrumbItem {
  href?: string;
  label: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="text-sm font-bold text-muted" aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link className="no-underline transition-colors hover:text-ink" href="/">
            Home
          </Link>
        </li>
        {items.map((item) => (
          <li className="flex items-center gap-1.5" key={`${item.href ?? 'current'}-${item.label}`}>
            <span aria-hidden="true">/</span>
            {item.href ? (
              <Link className="no-underline transition-colors hover:text-ink" href={item.href}>
                {item.label}
              </Link>
            ) : (
              <span className="text-ink" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
