<script lang="ts">
  // A loop at a glance (#121): its 8 steps of notes and drums, read-only, with the step that is
  // sounding marked. The share sheet's import preview uses it.
  import { DEGREES, STEPS, type Loop } from "./loop.ts";
  let { loop, now = -1 }: { loop: Loop; now?: number } = $props();
  const COLOURS = ["#ffd9b8", "#ffb477", "#ffd166", "#2f9e44", "#9aff6b", "#53e3ff", "#2b4cff", "#c77dff", "#ff8ac4", "#ff5c7a"];
  const rows = [
    ...[...DEGREES].reverse().map((d, r) => ({ on: (s: number) => loop.notes[s].includes(d), c: COLOURS[DEGREES.length - 1 - r] })),
    { on: (s: number) => loop.hat.includes(s), c: "#b6c5d8" },
    { on: (s: number) => loop.snare.includes(s), c: "#ffffff" },
    { on: (s: number) => loop.kick.includes(s), c: "#ffd166" },
  ];
</script>

<div class="mini" aria-label={`${loop.notes.flat().length} notes over ${STEPS} steps`} role="img">
  {#each rows as row}
    {#each { length: STEPS } as _, s}<span class:on={row.on(s)} class:now={now === s} style:--c={row.c}></span>{/each}
  {/each}
</div>

<style>
  .mini {
    display: grid;
    grid-template-columns: repeat(8, 12px);
    gap: 2px;
    margin: 8px 0;
  }
  span {
    width: 12px;
    height: 8px;
    border-radius: 2px;
    background: var(--surface-sunk);
  }
  span.on {
    background: var(--c);
  }
  span.now {
    outline: 1px solid var(--accent);
  }
</style>
