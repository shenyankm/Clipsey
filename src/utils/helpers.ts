export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString();
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `clip-${Math.random().toString(36).slice(2, 10)}`;
}
