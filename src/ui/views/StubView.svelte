<script lang="ts">
  let { title, phase }: { title: string; phase: number } = $props();
</script>

<h1>{title}</h1>
<p>Arrives in phase {phase}.</p>
