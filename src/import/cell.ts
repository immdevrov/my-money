export function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString();
  return String(cell).trim();
}

export function isBlank(cell: unknown): boolean {
  return cellText(cell) === '';
}
