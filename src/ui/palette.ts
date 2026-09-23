export const PALETTE: readonly { token: string; name: string }[] = [
  { token: '--palette-1', name: 'Blue' },
  { token: '--palette-2', name: 'Teal' },
  { token: '--palette-3', name: 'Green' },
  { token: '--palette-4', name: 'Lime' },
  { token: '--palette-5', name: 'Yellow' },
  { token: '--palette-6', name: 'Orange' },
  { token: '--palette-7', name: 'Red' },
  { token: '--palette-8', name: 'Pink' },
  { token: '--palette-9', name: 'Purple' },
  { token: '--palette-10', name: 'Indigo' },
  { token: '--palette-11', name: 'Brown' },
  { token: '--palette-12', name: 'Grey' },
];

export function colourName(token: string): string {
  return PALETTE.find((entry) => entry.token === token)?.name ?? token;
}
