import { cleanup, render, type Component, type ComponentImport } from 'vitest-browser-svelte';

export async function remount<C extends Component>(component: ComponentImport<C>) {
  cleanup();
  return await render(component);
}
