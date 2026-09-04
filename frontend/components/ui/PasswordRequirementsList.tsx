import { Check, X } from 'lucide-react';
import { getPasswordRequirements } from '@/lib/password-strength';

/** Live checklist mirroring the server's password rule -- see lib/password-strength.ts. */
export function PasswordRequirementsList({ password }: { password: string }) {
  const requirements = getPasswordRequirements(password);
  return (
    <ul className="grid gap-1 text-sm">
      {requirements.map((requirement) => (
        <li
          className={`flex items-center gap-1.5 ${requirement.met ? 'text-[#1AAE5C]' : 'text-muted'}`}
          key={requirement.key}
        >
          {requirement.met ? (
            <Check aria-hidden="true" className="size-3.5 shrink-0" />
          ) : (
            <X aria-hidden="true" className="size-3.5 shrink-0" />
          )}
          {requirement.label}
        </li>
      ))}
    </ul>
  );
}
