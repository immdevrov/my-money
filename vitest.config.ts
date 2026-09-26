import { playwright } from '@vitest/browser-playwright';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import type { BrowserCommand } from 'vitest/node';

const setColorScheme: BrowserCommand<['light' | 'dark']> = async (context, scheme) => {
  await context.page.emulateMedia({ colorScheme: scheme });
};

function browserProject(name: string, include: string[], exclude: string[] = []) {
  return {
    plugins: [svelte()],
    test: {
      name,
      include,
      exclude,
      setupFiles: ['vitest-browser-svelte', './tests/setup.ts'],
      testTimeout: 1000,
      browser: {
        enabled: true,
        headless: true,
        fileParallelism: false,
        screenshotFailures: false,
        provider: playwright({
          contextOptions: { timezoneId: 'Asia/Tbilisi' },
        }),
        instances: [{ browser: 'chromium' as const }],
        commands: { setColorScheme },
      },
    },
  };
}

export default defineConfig({
  test: {
    projects: [
      browserProject('behavior', ['tests/**/*.test.ts'], ['tests/import/**']),
      browserProject('import', ['tests/import/**/*.test.ts']),
      {
        test: {
          name: 'scratch',
          include: ['scratch/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
