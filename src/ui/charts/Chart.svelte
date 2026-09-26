<script lang="ts" module>
  import {
    BarController,
    BarElement,
    CategoryScale,
    Chart,
    Legend,
    LinearScale,
    LineController,
    LineElement,
    PointElement,
    Tooltip,
    type ChartConfiguration,
  } from 'chart.js';

  Chart.register(
    BarController,
    BarElement,
    CategoryScale,
    Legend,
    LinearScale,
    LineController,
    LineElement,
    PointElement,
    Tooltip,
  );

  export type ChartSeries = { label: string; values: number[]; color: string };
</script>

<script lang="ts">
  import { formatMinor } from '../../import/amount';

  type Props = {
    kind: 'bar' | 'line';
    name: string;
    labelHeader: string;
    labels: string[];
    series: ChartSeries[];
    onselect?: (index: number) => void;
  };

  let { kind, name, labelHeader, labels, series, onselect }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let schemeChanges = $state(0);
  let chart: Chart<'bar' | 'line', number[], string> | null = null;

  $effect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      schemeChanges += 1;
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  });

  function tickText(value: number | string): string {
    return typeof value === 'number' ? formatMinor(value) : value;
  }

  function buildConfig(target: HTMLCanvasElement): ChartConfiguration<'bar' | 'line', number[], string> {
    const style = getComputedStyle(target);
    const token = (property: string) => style.getPropertyValue(property).trim();
    const text = token('--text-muted');
    const grid = token('--border');

    return {
      type: kind,
      data: {
        labels: [...labels],
        datasets: series.map((entry) => ({
          label: entry.label,
          data: [...entry.values],
          backgroundColor: token(entry.color),
          borderColor: token(entry.color),
          ...(kind === 'bar'
            ? { maxBarThickness: 24, borderRadius: 4 }
            : { borderWidth: 2, pointRadius: 3 }),
        })),
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: kind === 'bar' },
        scales: {
          x: { grid: { color: grid }, ticks: { color: text } },
          y: {
            grid: { color: grid },
            ticks: { color: text, precision: 0, callback: tickText },
          },
        },
        plugins: {
          legend: { labels: { color: text } },
          tooltip: {
            callbacks: {
              label: (item) => `${item.dataset.label ?? ''}: ${formatMinor(item.parsed.y ?? 0)}`,
            },
          },
        },
        onClick: (_event, elements) => {
          const hit = elements[0];
          if (onselect !== undefined && hit !== undefined) onselect(hit.index);
        },
        onHover: (_event, elements) => {
          target.style.cursor = onselect !== undefined && elements.length > 0 ? 'pointer' : 'default';
        },
      },
    };
  }

  $effect(() => {
    void schemeChanges;
    if (canvas === null) return;
    const config = buildConfig(canvas);
    if (chart === null) {
      chart = new Chart(canvas, config);
      return;
    }
    chart.data = config.data;
    chart.options = config.options ?? {};
    chart.update();
  });

  $effect(() => () => {
    chart?.destroy();
    chart = null;
  });
</script>

<figure class="chart">
  <figcaption>{name}</figcaption>
  <div class="canvas-box">
    <canvas bind:this={canvas} aria-hidden="true"></canvas>
  </div>
  <table class="visually-hidden">
    <caption>{name}</caption>
    <thead>
      <tr>
        <th scope="col">{labelHeader}</th>
        {#each series as entry (entry.label)}
          <th scope="col">{entry.label}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each labels as label, index (index)}
        <tr>
          <th scope="row">{label}</th>
          {#each series as entry (entry.label)}
            <td>{formatMinor(entry.values[index] ?? 0)}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</figure>

<style>
  .chart {
    margin: var(--space-3) 0;
  }

  figcaption {
    font-weight: 600;
    padding-bottom: var(--space-2);
  }

  .canvas-box {
    position: relative;
    height: 16rem;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
</style>
