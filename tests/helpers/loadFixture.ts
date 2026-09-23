const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const fixtureUrls = import.meta.glob('../../fixtures/*.xlsx', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export async function loadFixture(name: string): Promise<File> {
  const key = Object.keys(fixtureUrls).find((path) => path.endsWith(`/${name}.xlsx`));
  if (key === undefined) {
    const known = Object.keys(fixtureUrls).join(', ');
    throw new Error(`Unknown fixture "${name}". Run npm run fixtures. Known: ${known}`);
  }

  const url = fixtureUrls[key];
  if (url === undefined) throw new Error(`Fixture "${name}" resolved to no URL`);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fixture "${name}" failed to load: ${response.status}`);

  return new File([await response.blob()], `${name}.xlsx`, { type: XLSX_MIME });
}
