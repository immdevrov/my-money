<script lang="ts">
  import { closeDatabase, openDatabase } from './db/database';
  import { requestPersistentStorage } from './db/persist';
  import CategoriesView from './ui/views/CategoriesView.svelte';
  import ImportView from './ui/views/ImportView.svelte';
  import RulesView from './ui/views/RulesView.svelte';
  import StubView from './ui/views/StubView.svelte';
  import TransactionsView from './ui/views/TransactionsView.svelte';

  type Route = { path: string; label: string; phase: number };

  const importRoute: Route = { path: 'import', label: 'Import', phase: 1 };
  const routes: Route[] = [
    importRoute,
    { path: 'transactions', label: 'Transactions', phase: 2 },
    { path: 'rules', label: 'Rules', phase: 4 },
    { path: 'categories', label: 'Categories', phase: 4 },
    { path: 'dashboard', label: 'Dashboard', phase: 5 },
    { path: 'settings', label: 'Settings', phase: 7 },
  ];

  function routeFromHash(): Route {
    const path = location.hash.replace(/^#\/?/, '');
    return routes.find((route) => route.path === path) ?? importRoute;
  }

  let active = $state(routeFromHash());

  $effect(() => {
    const sync = () => {
      active = routeFromHash();
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  });

  $effect(() => {
    void openDatabase().then(requestPersistentStorage);
    return () => closeDatabase();
  });
</script>

<nav aria-label="Views">
  <ul>
    {#each routes as route (route.path)}
      <li>
        <a
          href="#/{route.path}"
          aria-current={active.path === route.path ? 'page' : undefined}
        >
          {route.label}
        </a>
      </li>
    {/each}
  </ul>
</nav>

<main>
  {#if active.path === 'import'}
    <ImportView />
  {:else if active.path === 'transactions'}
    <TransactionsView />
  {:else if active.path === 'categories'}
    <CategoriesView />
  {:else if active.path === 'rules'}
    <RulesView />
  {:else}
    <StubView title={active.label} phase={active.phase} />
  {/if}
</main>

<style>
  nav {
    background: var(--surface-raised);
    border-bottom: 1px solid var(--border);
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    list-style: none;
    margin: 0;
    padding: var(--space-2) var(--space-3);
  }

  a {
    display: block;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius);
    color: var(--text-muted);
    text-decoration: none;
  }

  a:hover {
    color: var(--text);
  }

  a[aria-current='page'] {
    background: var(--accent);
    color: var(--accent-text);
  }

  main {
    padding: var(--space-3);
    max-width: 1400px;
  }
</style>
