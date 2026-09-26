import { vi } from 'vitest';

export function captureDownload(): () => Promise<File> {
  let blob: Blob | undefined;
  let name: string | undefined;

  vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
    blob = object as Blob;
    return 'blob:captured';
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    name = this.download;
  });

  return async () => {
    const [capturedBlob, capturedName] = await vi.waitFor(() => {
      if (blob === undefined || name === undefined) throw new Error('No download captured yet');
      return [blob, name] as const;
    });
    return new File([capturedBlob], capturedName, { type: capturedBlob.type });
  };
}
