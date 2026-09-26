import { commands } from 'vitest/browser';

export type ColorScheme = 'light' | 'dark';

declare module 'vitest/browser' {
  interface BrowserCommands {
    setColorScheme: (scheme: ColorScheme) => Promise<void>;
  }
}

export async function setColorScheme(scheme: ColorScheme): Promise<void> {
  await commands.setColorScheme(scheme);
}
