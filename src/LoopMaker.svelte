<script lang="ts">
  // The LOOPS screen (#121, docs/loops.md): saved loops, and a step grid to make one. Nothing is
  // saved until SAVE; every write goes through commit (loop.ts commitLoops). One player owns the
  // sound, and it stops whenever this screen is left, a sheet opens or the page hides.
  import { onMount } from "svelte";
  import { TRACKS, trackFor } from "./music.ts";
  import { LoopPlayer } from "./loop-player.ts";
  import {
    DEGREES,
    MAX_NAME,
    MAX_ROOT,
    MAX_WOBBLE,
    MIN_ROOT,
    MIN_WOBBLE,
    STEPS,
    addLoop,
    blankLoop,
    deleteLoop,
    loopFromSong,
    loopName,
    saveLoop,
    surprise,
    toggleDrum,
    toggleNote,
    type Loop,
    type LoopStore,
  } from "./loop.ts";

  let {
    store,
    broken,
    commit,
    confirm,
    share,
    importLoop,
    back,
    editing = $bindable(false),
  }: {
    store: LoopStore;
    broken: boolean;
    commit: (change: (latest: LoopStore) => void) => LoopStore;
    confirm: (title: string, text: string, yes: string, run: () => void) => void;
    share: (loop: Loop) => void;
    importLoop: () => void;
    back: () => void;
    // true while a loop is open: the app hides its bottom bar, so the only way out is ← LOOPS,
    // which asks before dropping changes
    editing?: boolean;
  } = $props();

  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const COLOURS = ["#ffd9b8", "#ffb477", "#ffd166", "#2f9e44", "#9aff6b", "#53e3ff", "#2b4cff", "#c77dff", "#ff8ac4", "#ff5c7a"];
  const DRUM_ROWS = [
    ["hat", "HAT"],
    ["snare", "SNARE"],
    ["kick", "KICK"],
  ] as const;
  const SONGS = Array.from({ length: TRACKS.length + 100 }, (_, i) => i);

  let view = $state<"list" | "edit">("list");
  $effect(() => {
    editing = view !== "list";
  });
  let editingId = $state<number | null>(null),
    loop = $state.raw<Loop>(blankLoop()),
    dirty = $state(false),
    message = $state(""),
    failed = $state(false),
    now = $state(-1),
    playingId = $state<number | null>(null),
    playing = $state(false);
  // the loop the player reads each step, so edits are heard on the next one
  let sounding: Loop = blankLoop();
  const player = new LoopPlayer(
    () => sounding,
    (step) => (now = step),
  );

  function say(text: string, bad = false) {
    message = text;
    failed = bad;
  }
  function fail(cause: unknown) {
    say(cause instanceof Error ? cause.message : "Something went wrong. Nothing was changed.", true);
  }
  function write(change: (latest: LoopStore) => void, done: string) {
    try {
      commit(change);
      say(done);
      return true;
    } catch (cause) {
      fail(cause);
      return false;
    }
  }
  // also called by the app before its own sheets (MORE) open over the loop list
  export function silence() {
    player.stop();
    playing = false;
    playingId = null;
    now = -1;
  }
  async function play(target: Loop, id: number | null) {
    if (playing && playingId === id) return silence();
    silence();
    sounding = target;
    playingId = id;
    playing = true;
    try {
      await player.start();
    } catch {
      playing = false;
      say("Sound could not start on this device.", true);
    }
  }
  function set(next: Loop) {
    loop = next;
    sounding = next;
    dirty = true;
  }
  function edit(id: number | null, from?: Loop) {
    silence();
    editingId = id;
    loop = from ? structuredClone(from) : { ...loopFromSong(0), name: `My loop ${store.next}`.slice(0, MAX_NAME) };
    sounding = loop;
    dirty = false;
    say("");
    view = "edit";
  }
  function leave() {
    const done = () => {
      silence();
      dirty = false;
      view = "list";
      say("");
    };
    if (!dirty) return done();
    silence();
    confirm("Leave without saving?", "Your changes to this loop will be lost.", "LEAVE", done);
  }
  function save() {
    const was = editingId;
    let id = 0;
    if (write((s) => void (id = saveLoop(s, was, loop)), "Saved.")) {
      editingId = id;
      dirty = false;
    }
  }
  function tap(kind: "note" | "kick" | "snare" | "hat", step: number, degree = 0) {
    const next = kind === "note" ? toggleNote(loop, step, degree) : toggleDrum(loop, kind, step);
    set(next);
    const on = kind === "note" ? next.notes[step].includes(degree) : next[kind].includes(step);
    if (on) void player.hear(kind, kind === "note" ? degree : step).catch(() => {});
  }
  // START FROM, SURPRISE ME and CLEAR NOTES replace the notes, and there is no undo, so they ask
  // first whenever there are notes to lose; KEEP IT leaves the draft exactly as it was
  // `lose` is whether the replacement throws away anything the player made
  function replace(next: Loop, lose: boolean, title: string, yes: string, what: string) {
    if (!lose) return set(next);
    sheet(() => confirm(title, `${what} will be replaced. This cannot be undone.`, yes, () => set(next)));
  }
  const hasNotes = () => loop.notes.some((s) => s.length);
  // START FROM replaces everything but the name: key, wobble, drop, drums and notes, so anything
  // that differs from a blank loop is work to lose (a drum-only loop included)
  const blank = blankLoop();
  const changed = () => JSON.stringify({ ...loop, name: "" }) !== JSON.stringify({ ...blank, name: "" });
  function startFrom(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    if (select.value === "") return;
    const song = Number(select.value);
    select.value = "";
    replace({ ...loopFromSong(song), name: loop.name }, changed(), `Start from ${trackFor(song).name}?`, "START FROM IT", "Everything in this loop but its name");
  }
  const info = (l: Loop) => `Key ${NAMES[l.root % 12]} · wobble ${l.wobble}${l.drop ? " · drop" : ""}`;
  // a sheet (share, confirm) always opens over silence
  function sheet(open: () => void) {
    silence();
    open();
  }

  onMount(() => {
    const hide = () => document.hidden && silence();
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      void player.close();
    };
  });
</script>

<section id="loops" class="screen" class:editing={view !== "list"} aria-label="My loops">
  {#if view === "list"}
    <header class="home-head">
      <button id="loops-back" onclick={() => (silence(), back())}>← MENU</button>
      <h1>My loops</h1>
      <button id="new-loop" class="primary" onclick={() => edit(null)}>＋ NEW LOOP</button>
      <button id="import-loop" onclick={() => sheet(importLoop)}>IMPORT LOOP</button>
    </header>
    <p class="loops-status">
      {broken
        ? "Your saved loops could not be read on this device. They were left as they are."
        : "Saved on this device. Make a loop from the game's own sounds, then share it."}
    </p>
    <div id="loop-list">
      {#each store.loops as { id, loop: saved } (id)}
        <article class="loop-card">
          <div>
            <h2>{loopName(saved)}</h2>
            <p>{info(saved)}</p>
          </div>
          <div class="buttons">
            <button
              class="primary"
              aria-label={`${playing && playingId === id ? "Stop" : "Play"} ${loopName(saved)}`}
              aria-pressed={playing && playingId === id}
              onclick={() => play(saved, id)}>{playing && playingId === id ? "■ STOP" : "▶ PLAY"}</button
            ><button aria-label={`Edit ${loopName(saved)}`} onclick={() => edit(id, saved)}>EDIT</button
            ><button aria-label={`Share ${loopName(saved)}`} onclick={() => sheet(() => share(saved))}>SHARE</button
            ><button
              aria-label={`Copy ${loopName(saved)}`}
              onclick={() => write((s) => void addLoop(s, { ...saved, name: `${loopName(saved).slice(0, MAX_NAME - 7)} (copy)` }), "Copied.")}
              >COPY</button
            ><button
              aria-label={`Delete ${loopName(saved)}`}
              onclick={() =>
                sheet(() =>
                  confirm("Delete this loop?", `Remove "${loopName(saved)}"? This cannot be undone.`, "DELETE LOOP", () =>
                    write((s) => deleteLoop(s, id), `"${loopName(saved)}" deleted.`),
                  ),
                )}>DELETE</button
            >
          </div>
        </article>
      {:else}
        <p class="empty">No loops yet. Tap ＋ NEW LOOP to make one.</p>
      {/each}
    </div>
  {:else}
    <header class="home-head loop-head">
      <button id="loop-done" onclick={leave}>← LOOPS</button>
      <label class="loop-name"
        ><span class="sr">Loop name</span><input
          id="loop-name"
          maxlength={MAX_NAME}
          value={loop.name}
          oninput={(e) => set({ ...loop, name: e.currentTarget.value })}
          spellcheck="false"
          autocomplete="off"
        /></label
      >
      <button id="loop-play" class="primary" aria-pressed={playing} onclick={() => play(loop, editingId)}
        >{playing ? "■ STOP" : "▶ PLAY"}</button
      >
      <button id="save-loop" onclick={save}>SAVE</button>
    </header>
    <!-- the toolbar above stays put; the controls and the grid scroll here (#133) -->
    <div class="loop-body">
    <div class="loop-controls">
      <label class="start-from"
        ><span class="sr">Start from a song</span><select id="loop-song" onchange={startFrom}>
          <option value="">START FROM A SONG…</option>
          {#each SONGS as index}<option value={index}>{trackFor(index).name}</option>{/each}
        </select></label
      >
      <div class="key" role="group" aria-label="Key">
        <button
          id="key-down"
          aria-label="Key lower"
          disabled={loop.root <= MIN_ROOT}
          onclick={() => set({ ...loop, root: loop.root - 1 })}>−</button
        ><output id="loop-key" aria-label="Key">{NAMES[loop.root % 12]}</output><button
          id="key-up"
          aria-label="Key higher"
          disabled={loop.root >= MAX_ROOT}
          onclick={() => set({ ...loop, root: loop.root + 1 })}>+</button
        >
      </div>
      <label class="wobble"
        >WOBBLE <input
          id="loop-wobble"
          type="range"
          min={MIN_WOBBLE}
          max={MAX_WOBBLE}
          step="1"
          value={loop.wobble}
          oninput={(e) => set({ ...loop, wobble: Number(e.currentTarget.value) })}
        /></label
      >
      <button id="loop-drop" aria-pressed={loop.drop} onclick={() => set({ ...loop, drop: !loop.drop })}
        >{loop.drop ? "DROP ON" : "DROP OFF"}</button
      >
      <button id="loop-surprise" onclick={() => replace(surprise(loop), hasNotes(), "Make new notes?", "SURPRISE ME", "The notes in this loop")}
        >SURPRISE ME</button
      >
      <button
        id="loop-clear"
        onclick={() =>
          replace({ ...loop, notes: Array.from({ length: STEPS }, () => []) }, hasNotes(), "Clear the notes?", "CLEAR NOTES", "The notes in this loop")}
        >CLEAR NOTES</button
      >
    </div>
    <div class="loop-grid-box">
      <div id="loop-grid" role="group" aria-label="Loop steps">
        <div class="loop-row steps">
          <span class="tag"></span>
          {#each { length: STEPS } as _, s}<b class:now={now === s}>{s + 1}</b>{/each}
        </div>
        {#each [...DEGREES].reverse() as degree, r}
          <div class="loop-row" style:--c={COLOURS[DEGREES.length - 1 - r]}>
            <span class="tag" aria-hidden="true"><i></i></span>
            {#each { length: STEPS } as _, s}<button
                class="cell"
                class:now={now === s}
               
                aria-label={`note ${DEGREES.length - r} step ${s + 1}`}
                aria-pressed={loop.notes[s].includes(degree)}
                onclick={() => tap("note", s, degree)}
              ></button>{/each}
          </div>
        {/each}
        {#each DRUM_ROWS as [kind, label], r}
          <div class="loop-row" class:gap={r === 0} style:--c={kind === "kick" ? "#ffd166" : kind === "snare" ? "#ffffff" : "#b6c5d8"}>
            <span class="tag">{label}</span>
            {#each { length: STEPS } as _, s}<button
                class="cell"
                class:now={now === s}
               
                aria-label={`${kind} step ${s + 1}`}
                aria-pressed={loop[kind].includes(s)}
                onclick={() => tap(kind, s)}
              ></button>{/each}
          </div>
        {/each}
      </div>
    </div>
    </div>
  {/if}
  <p id="loop-message" class:failed role="status" hidden={!message}>{message}</p>
</section>

<style>
  /* the same screen frame as My skins */
  #loops {
    position: relative;
    height: 100dvh;
    overflow: auto;
    background: var(--surface);
    padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right))
      max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
  }
  .home-head {
    flex-wrap: wrap;
  }
  /* editing a loop: the name, PLAY and SAVE stay on screen; only the body below them scrolls */
  #loops.editing {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  #loops.editing > .loop-head {
    flex: none;
  }
  .loop-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  h1 {
    font-size: 32px;
    letter-spacing: -0.025em;
  }
  .loops-status,
  .empty {
    color: var(--ink-dim);
    margin: 20px 0;
    line-height: 1.5;
    font-size: 14px;
  }
  #loop-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 270px), 1fr));
    gap: 16px;
  }
  .loop-card {
    display: grid;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
    min-width: 0;
  }
  .loop-card h2 {
    font-size: 18px;
    overflow-wrap: anywhere;
  }
  .loop-card p {
    font-size: 14px;
    color: var(--ink-dim);
    margin-top: 4px;
  }
  .loop-card .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .loop-card .buttons button {
    flex: 1;
    padding-inline: 10px;
    font-size: 13px;
  }
  .loop-head {
    flex-wrap: wrap;
  }
  .loop-name {
    flex: 1 1 140px;
    min-width: 0;
  }
  .loop-name input {
    width: 100%;
    min-height: 44px;
    font: inherit;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-sunk);
    color: var(--ink);
  }
  .loop-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 8px 0;
  }
  /* WebKit keeps a native select short whatever its min-height, so it draws its own box */
  .start-from select {
    -webkit-appearance: none;
    appearance: none;
    height: 44px;
    max-width: 100%;
    padding: 0 12px;
    font: inherit;
    font-weight: 800;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
    color: var(--ink);
  }
  .key {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .key button {
    min-width: 44px;
  }
  .key output {
    min-width: 32px;
    text-align: center;
    font-weight: 800;
  }
  .wobble {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    font-weight: 800;
  }
  .wobble input {
    min-height: 44px;
    width: 120px;
  }
  /* the grid scrolls inside its own box where 8 steps do not fit, never the page */
  .loop-grid-box {
    max-width: 100%;
    overflow-x: auto;
    padding-bottom: 8px;
  }
  #loop-grid {
    display: grid;
    gap: 4px;
    width: max-content;
  }
  .loop-row {
    display: grid;
    grid-template-columns: 52px repeat(8, 44px);
    gap: 4px;
    align-items: center;
  }
  .loop-row.gap {
    margin-top: 8px;
  }
  .steps b {
    text-align: center;
    font-size: 12px;
    border-radius: 4px;
  }
  .steps b.now {
    background: var(--accent);
    color: var(--surface);
  }
  .tag {
    font-size: 11px;
    font-weight: 800;
  }
  .tag i {
    display: block;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--c);
  }
  .cell {
    width: 44px;
    height: 44px;
    min-width: 44px;
    padding: 0;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: var(--surface-sunk);
  }
  .cell[aria-pressed="true"] {
    background: var(--c);
  }
  .cell.now {
    outline: 2px solid var(--accent);
  }
  .failed {
    color: var(--warn);
  }
</style>
