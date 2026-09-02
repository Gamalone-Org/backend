export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);
}

export function uniqueSlug(input: string, used: (slug: string) => Promise<boolean>): Promise<string> {
  const base = slugify(input) || 'item';
  return (async () => {
    let candidate = base;
    let i = 2;
    while (await used(candidate)) {
      candidate = `${base}-${i}`;
      i += 1;
    }
    return candidate;
  })();
}
