export function roleHomePath(role: string | undefined): string {
  return role === 'ADMIN' ? '/admin' : '/dashboard';
}
