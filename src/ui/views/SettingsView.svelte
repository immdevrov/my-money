<script lang="ts">
  import { liveQuery } from 'dexie';
  import { foreignCurrencies } from '../../aggregate/gel';
  import { getManualRates, setManualRate } from '../../db/settings';
  import { listAll } from '../../db/transactions';
  import { scaledFromDecimal } from '../../import/amount';
  import { formatRate } from '../../import/details/conversion';

  const RATE_DECIMALS = 6;
  const RATE_INPUT = /^\d+(\.\d{1,6})?$/;
  const INVALID_RATE = 'Enter a positive rate with up to 6 decimals, or leave it empty to clear it.';

  const rateData = liveQuery(async () => {
    const [rows, manual] = await Promise.all([listAll(), getManualRates()]);
    return { currencies: foreignCurrencies(rows, manual), manual };
  });

  let drafts = $state<Record<string, string>>({});
  let invalid = $state<Record<string, boolean>>({});

  function savedText(currency: string): string {
    const saved = $rateData?.manual[currency];
    return saved === undefined ? '' : formatRate(saved);
  }

  function parseRate(text: string): number | null | 'invalid' {
    const trimmed = text.trim();
    if (trimmed === '') return null;
    if (!RATE_INPUT.test(trimmed)) return 'invalid';
    const scaled = scaledFromDecimal(trimmed, RATE_DECIMALS).value;
    return scaled > 0 ? scaled : 'invalid';
  }

  async function save(event: SubmitEvent, currency: string) {
    event.preventDefault();
    const rate = parseRate(drafts[currency] ?? savedText(currency));
    if (rate === 'invalid') {
      invalid = { ...invalid, [currency]: true };
      return;
    }
    await setManualRate(currency, rate);
    invalid = { ...invalid, [currency]: false };
    drafts = { ...drafts, [currency]: rate === null ? '' : formatRate(rate) };
  }
</script>

<h1>Settings</h1>

<section aria-labelledby="manual-rates-heading">
  <h2 id="manual-rates-heading">Manual rates</h2>

  {#if $rateData !== undefined}
    {#if $rateData.currencies.length === 0}
      <p>No foreign-currency transactions.</p>
    {:else}
      <table>
        <caption>Manual rates</caption>
        <thead>
          <tr>
            <th scope="col">Currency</th>
            <th scope="col">Without a conversion rate</th>
            <th scope="col">Manual rate (GEL per unit)</th>
          </tr>
        </thead>
        <tbody>
          {#each $rateData.currencies as { currency, withoutRate } (currency)}
            <tr>
              <th scope="row">{currency}</th>
              <td>{withoutRate}</td>
              <td>
                <form class="rate" onsubmit={(event) => save(event, currency)}>
                  <input
                    type="text"
                    inputmode="decimal"
                    aria-label={`Manual rate for ${currency}`}
                    bind:value={
                      () => drafts[currency] ?? savedText(currency),
                      (value) => (drafts = { ...drafts, [currency]: value })
                    }
                  />
                  <button type="submit" aria-label={`Save rate for ${currency}`}>Save</button>
                </form>
                {#if invalid[currency]}
                  <p class="error" role="alert">{INVALID_RATE}</p>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</section>

<style>
  table {
    border-collapse: collapse;
    width: 100%;
  }

  th,
  td {
    border-bottom: 1px solid var(--border);
    padding: var(--space-1) var(--space-2);
    text-align: left;
    vertical-align: top;
  }

  .rate {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .rate input {
    width: 10ch;
  }

  .error {
    background: var(--danger-surface);
    color: var(--danger);
    margin: var(--space-1) 0 0;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius);
  }
</style>
