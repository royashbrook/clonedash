<script lang="ts">
  // The LOOPS screen (#121, docs/loops.md): saved loops, and a step grid to make one. Nothing is
  // saved until SAVE; every write goes through commit (loop.ts commitLoops). One player owns the
  // sound, and it stops whenever this screen is left, a sheet opens or the page hides.
  import { onMount } from "svelte";
  import SongMaker from "./SongMaker.svelte";
  import type { SongBook, Arrangement } from "./arrangement.ts";
  import { TRACKS, trackFor } from "./music.ts";
  import { LoopPlayer } from "./loop-player.ts";
  import { BEAT } from "./voices.ts";
  import {
    DEGREES,
    MAX_NAME,
    MAX_ROOT,
    MAX_WOBBLE,
    MIN_ROOT,
    MIN_WOBBLE,
    LENGTHS,
    addLoop,
    blankLoop,
    cutLoses,
    deleteLoop,
    loopFromSong,
    loopName,
    resize,
    saveLoop,
    surprise,
    toggleDrum,
    toggleNote,
    type Loop,
    type LoopStore,
  } from "./loop.ts";

  let {
    store, songBook, songsBroken, commitSong,
    broken,
    commit,
    confirm,
    share,
    importLoop,
    back,
    editing = $bindable(false),
  }: {
    store: LoopStore;
    songBook: SongBook; songsBroken:boolean; commitSong:(id:number|null,s:Arrangement|null)=>number|null;
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
  let songsTab=$state(false), arranger=$state<ReturnType<typeof SongMaker>>();
  let saveSection: ((loop: Loop)=>void)|undefined;
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
  // the bottom bar's tabs leave through here (#140): a draft with changes asks first, and only LEAVE
  // goes on; KEEP IT leaves the name and notes exactly as they were
  export function guard(go: () => void) {
    silence();
    if (songsTab && (dirty || arranger?.hasChanges())) {
      return confirm("Leave without saving?", "Unsaved song changes will be lost.", "LEAVE", () => {dirty=false; saveSection=undefined; arranger?.list(); go();});
    }
    if (view === "list" || !dirty) return go();
    confirm("Leave without saving?", "Your changes to this loop will be lost.", "LEAVE", () => {
      dirty = false;
      go();
    });
  }
  // the MUSIC tab while a loop is open: back to the list
  export function close() {
    saveSection=undefined; arranger?.list();
    view = "list";
    say("");
  }
  // also called by the app before its own sheets (MORE) open over the loop list
  export function silence() {
    arranger?.silence();
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
  function edit(id: number | null, from?: Loop, bpm = 150) {
    silence();
    player.beat = 60 / bpm;
    editingId = id;
    loop = from ? structuredClone(from) : { ...loopFromSong(0), name: `My loop ${store.next}`.slice(0, MAX_NAME) };
    sounding = loop;
    dirty = false;
    say("");
    panel = null;
    page = 0;
    view = "edit";
  }
  function leave() {
    const done = () => {
      silence();
      dirty = false;
      view = "list";
      saveSection=undefined;
      say("");
    };
    if (!dirty) return done();
    silence();
    confirm("Leave without saving?", "Your changes to this loop will be lost.", "LEAVE", done);
  }
  function save() {
    if (saveSection) {
      try { saveSection(loop); saveSection=undefined; dirty=false; silence(); view="list"; say(""); }
      catch(e) { fail(e); }
      return;
    }
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
  // SWIPE NOTES (#139): off, a cell toggles on its own tap and the grid scrolls sideways as before.
  // on, a finger stroke paints: the first cell decides paint (it was off) or erase (it was on), and
  // every cell the stroke crosses is set to that, so coming back over a cell never flips it again.
  // the path between two pointer events is sampled, so a fast swipe cannot jump a cell, and
  // lifting the finger, a cancel or losing the pointer ends the stroke. a stroke belongs to the one
  // pointer that started it (a primary press with the main button): a second finger, or any other
  // pointer, neither starts, moves nor ends it. in swipe mode a pointer's click on a cell does
  // nothing (strokes set cells); a keyboard press still clicks, and toggles, one cell.
  type Kind = "note" | "kick" | "snare" | "hat";
  let swipe = $state(false),
    stroke: { id: number; paint: boolean; x: number; y: number } | null = null;
  // the phone layout (#140): TOOLS and HELP open over the grid; a longer loop shows 8 steps a page
  let panel = $state<"tools" | "help" | null>(null),
    page = $state(0);
  let roomWidth = $state(0), roomHeight = $state(0);
  const bars = $derived(loop.notes.length / 8);
  const layout = $derived.by(() => {
    let best = { across: 1, down: 1, count: 1, target: 0 };
    // A bar keeps eight 30px-wide pads. Only wrap when another row of 13 pads
    // fits above the dock. On a narrow phone keep one bar, even if it's tall.
    for (let across = 2; across <= bars; across++) {
      const padWidth = ((roomWidth - (across - 1) * 6) / across - 7) / 8;
      for (let down = 1; down <= 2; down++) {
        if (down > 1 && across >= bars) continue;
        const count = Math.min(bars, across * down);
        const gridHeight = roomHeight - (count < bars ? 50 : 0);
        const padHeight = ((gridHeight - (down - 1) * 6) / down - 62) / 13;
        const target = Math.min(44, padWidth, padHeight);
        if (padWidth < 30 || padHeight < 24) continue;
        if (count > best.count || (count === best.count && (target > best.target || (target === best.target && down < best.down))))
          best = { across, down, count, target };
      }
    }
    return best;
  });
  const firstBar = $derived(Math.floor(page / layout.count) * layout.count);
  const shownBars = $derived(Array.from({ length: Math.min(layout.count, bars - firstBar) }, (_, i) => i + firstBar));
  const steps = (bar: number) => Array.from({ length: 8 }, (_, i) => bar * 8 + i);
  $effect(() => {
    if (page * 8 >= loop.notes.length) page = 0;
  });
  function press(e: MouseEvent, kind: Kind, step: number, degree = 0) {
    if (swipe && e.detail !== 0) return;
    tap(kind, step, degree);
  }
  const isOn = (kind: Kind, step: number, degree: number) =>
    kind === "note" ? loop.notes[step].includes(degree) : loop[kind].includes(step);
  const cellAt = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>("#loop-grid .cell") ?? null;
  const read = (c: HTMLElement) => [c.dataset.kind as Kind, Number(c.dataset.step), Number(c.dataset.degree)] as const;
  function paint(c: HTMLElement) {
    const [kind, step, degree] = read(c);
    if (stroke && isOn(kind, step, degree) !== stroke.paint) tap(kind, step, degree);
  }
  function strokeDown(e: PointerEvent) {
    if (!swipe || stroke || !e.isPrimary || e.button !== 0) return;
    const c = cellAt(e.clientX, e.clientY);
    if (!c) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    stroke = { id: e.pointerId, paint: !isOn(...read(c)), x: e.clientX, y: e.clientY };
    paint(c);
  }
  function strokeMove(e: PointerEvent) {
    if (!stroke || e.pointerId !== stroke.id) return;
    const dx = e.clientX - stroke.x,
      dy = e.clientY - stroke.y,
      n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
    for (let i = 1; i <= n; i++) {
      const c = cellAt(stroke.x + (dx * i) / n, stroke.y + (dy * i) / n);
      if (c) paint(c);
    }
    stroke.x = e.clientX;
    stroke.y = e.clientY;
  }
  function strokeEnd(e: PointerEvent) {
    if (stroke && e.pointerId === stroke.id) stroke = null;
  }
  // LENGTH (#140): growing adds silent steps at the end; shrinking asks first when the cut steps
  // hold notes or drum hits (KEEP IT leaves the draft exactly as it was)
  function setLength(n: number) {
    const from = loop.notes.length;
    if (n === from) return;
    const next = resize(loop, n);
    panel = null;
    if (n < from && cutLoses(loop, n))
      sheet(() =>
        confirm(
          `Cut the loop to ${n} steps?`,
          `The notes and drum hits after step ${n} will be removed. This cannot be undone.`,
          `CUT TO ${n}`,
          () => set(next),
        ),
      );
    else set(next);
  }
  // START FROM, SURPRISE ME and CLEAR NOTES replace the notes, and there is no undo, so they ask
  // first whenever there are notes to lose; KEEP IT leaves the draft exactly as it was
  // `lose` is whether the replacement throws away anything the player made
  function replace(next: Loop, lose: boolean, title: string, yes: string, what: string) {
    panel = null; // a tool that replaces the notes shows the grid it changes
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
    panel = null;
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
  {#if songsTab}
    <div hidden={view !== "list"}><SongMaker bind:this={arranger} book={songBook} broken={songsBroken} loops={store} commit={commitSong} {confirm}
      edit={(section,bpm,accept)=>{saveSection=accept;edit(null,section,bpm);}}
      toLoops={()=>{silence();player.beat=BEAT;songsTab=false;}} /></div>
  {/if}
  {#if view === "list" && !songsTab}
    <header class="home-head">
      <button id="loops-back" onclick={() => (silence(), back())}>← MENU</button>
      <h1>My loops</h1>
      <button id="my-songs" onclick={()=>{silence();dirty=false;songsTab=true;}}>MY SONGS</button>
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
  {:else if view === "edit"}
    <header class="home-head loop-head">
      <button id="loop-done" onclick={leave}>{songsTab ? "← SONG" : "← LOOPS"}</button>
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
      <button id="save-loop" onclick={save}>{songsTab ? "USE SECTION" : "SAVE"}</button>
    </header>
    <!-- the phone layout (#140): one toolbar row; the rest of the tools and the help open over the grid -->
    <div class="loop-toolbar">
      <button id="loop-tools" aria-expanded={panel === "tools"} onclick={() => (panel = panel === "tools" ? null : "tools")}
        >TOOLS</button
      >
      <button id="loop-swipe" aria-pressed={swipe} onclick={() => (swipe = !swipe)}>{swipe ? "SWIPE ON" : "SWIPE OFF"}</button>
      <button id="loop-help" aria-expanded={panel === "help"} onclick={() => (panel = panel === "help" ? null : "help")}>HELP</button>
    </div>
    <div class="loop-workspace" bind:clientWidth={roomWidth} bind:clientHeight={roomHeight}>
      {#if bars > layout.count}
        <div class="pages" role="group" aria-label="Steps shown">
          {#each { length: Math.ceil(bars / layout.count) } as _, p}<button
              id={`loop-page-${p * layout.count + 1}`}
              aria-label={`Steps ${p * layout.count * 8 + 1} to ${Math.min(bars, (p + 1) * layout.count) * 8}`}
              aria-pressed={firstBar === p * layout.count}
              onclick={() => (page = p * layout.count)}>{p * layout.count * 8 + 1}</button
            >{/each}
        </div>
      {/if}
    <div class="loop-stage">
      {#if panel === "tools"}
        <div class="loop-panel" id="loop-tools-panel" role="group" aria-label="Loop tools">
          <label class="start-from"
            ><span class="sr">Start from a song</span><select id="loop-song" onchange={startFrom}>
              <option value="">START FROM A SONG…</option>
              {#each SONGS as index}<option value={index}>{trackFor(index).name}</option>{/each}
            </select></label
          >
          <div class="key" role="group" aria-label="Key">
            KEY <button
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
          <div class="length" role="group" aria-label="Loop length in steps">
            STEPS {#each LENGTHS as n}<button
                id={`loop-length-${n}`}
                aria-label={`${n} steps`}
                aria-pressed={loop.notes.length === n}
                onclick={() => setLength(n)}>{n}</button
              >{/each}
          </div>
          <button id="loop-drop" aria-pressed={loop.drop} onclick={() => set({ ...loop, drop: !loop.drop })}
            >{loop.drop ? "DROP ON" : "DROP OFF"}</button
          >
          <button id="loop-surprise" onclick={() => replace(surprise(loop), hasNotes(), "Make new notes?", "SURPRISE ME", "The notes in this loop")}
            >SURPRISE ME</button
          >
          <button
            id="loop-clear"
            onclick={() =>
              replace({ ...loop, notes: Array.from({ length: loop.notes.length }, () => []) }, hasNotes(), "Clear the notes?", "CLEAR NOTES", "The notes in this loop")}
            >CLEAR NOTES</button
          >
          <button class="primary" onclick={() => (panel = null)}>DONE</button>
        </div>
      {:else if panel === "help"}
        <div class="loop-panel" id="loop-help-panel" role="note">
          <p>Each column is a step. The loop plays them left to right, then starts again.</p>
          <p>The top ten rows are notes, high at the top, low at the bottom.</p>
          <p>The last three rows are drums: hi-hat, then snare, then kick.</p>
          <p>Tap a square to turn it on or off. With SWIPE on, drag to fill or clear many.</p>
          <p>Each bar has eight steps. Read bars from left to right, then down. When more bars fit on another page, use the step numbers above.</p>
          <button class="primary" onclick={() => (panel = null)}>GOT IT</button>
        </div>
      {/if}
      <div class="loop-grid-box" class:swiping={swipe}>
        <div
          id="loop-grid"
          role="group"
          aria-label="Loop steps"
          style:--across={layout.across}
          style:--down={layout.down}
          class:expanded={layout.count > 1}
          onpointerdown={strokeDown}
          onpointermove={strokeMove}
          onpointerup={strokeEnd}
          onpointercancel={strokeEnd}
          onlostpointercapture={strokeEnd}
        >
          {#each shownBars as bar (bar)}
            {@const shown = steps(bar)}
            <div class="loop-bar" role="group" aria-label={`Bar ${bar + 1}`}>
          {#each shown as s}<b class="step" class:now={now === s}>{s + 1}</b>{/each}
          {#each [...DEGREES].reverse() as degree, r}
            {#each shown as s}<button
                class="cell"
                class:now={now === s}
                style:--c={COLOURS[DEGREES.length - 1 - r]}
                aria-label={`note ${DEGREES.length - r} step ${s + 1}`}
                aria-pressed={loop.notes[s].includes(degree)}
                data-kind="note"
                data-step={s}
                data-degree={degree}
                onclick={(e) => press(e, "note", s, degree)}
              ></button>{/each}
          {/each}
          <i class="drums" aria-hidden="true"></i>
          {#each DRUM_ROWS as [kind]}
            {#each shown as s}<button
                class="cell"
                class:now={now === s}
                style:--c={kind === "kick" ? "#ffd166" : kind === "snare" ? "#ffffff" : "#b6c5d8"}
                aria-label={`${kind} step ${s + 1}`}
                aria-pressed={loop[kind].includes(s)}
                data-kind={kind}
                data-step={s}
                data-degree="0"
                onclick={(e) => press(e, kind, s)}
              ></button>{/each}
          {/each}
            </div>
          {/each}
        </div>
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
  /* editing a loop (#140, a phone held upright first): a fixed column of the header, one toolbar,
     and the grid filling what is left above the bottom bar, so nothing scrolls and nothing is cut */
  #loops.editing {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: hidden;
    padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right))
      max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
  }
  #loops.editing > .loop-head,
  .loop-toolbar {
    flex: none;
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
    flex-wrap: nowrap;
    gap: 6px;
  }
  .loop-head > button {
    flex: none;
    padding-inline: 10px;
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
  .length {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 800;
  }
  .length button {
    min-width: 44px;
    min-height: 44px;
    padding-inline: 8px;
  }
  .loop-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .loop-toolbar > button {
    flex: 1 1 0;
    min-height: 44px;
    padding-inline: 6px;
    font-size: 13px;
  }
  .loop-workspace {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pages {
    display: flex;
    gap: 6px;
    flex: none;
  }
  .pages button {
    flex: 1 1 0;
    min-height: 44px;
    font-size: 13px;
  }
  .loop-stage {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    overflow-y: auto;
  }
  /* TOOLS and HELP open over the grid; the draft stays as it is underneath */
  .loop-panel {
    position: absolute;
    inset: 0;
    z-index: 2;
    overflow: auto;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
  }
  .loop-panel p {
    flex-basis: 100%;
    line-height: 1.45;
  }
  .loop-grid-box {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    justify-content: center;
  }
  /* 8 steps, a short row of step numbers, 10 note rows, a gap, 3 drum rows, all in the space left;
     cells grow to 44px and no further */
  #loop-grid {
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: repeat(var(--across), minmax(0, 1fr));
    grid-template-rows: repeat(var(--down), minmax(348px, 1fr));
    gap: 6px;
    --bar-width: 373px;
    max-width: calc(var(--across) * var(--bar-width) + (var(--across) - 1) * 6px);
    max-height: calc(var(--down) * 634px + (var(--down) - 1) * 6px);
  }
  #loop-grid.expanded {
    --bar-width: 359px;
  }
  .expanded .loop-bar {
    column-gap: 1px;
  }
  .loop-bar {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    /* rows never below 22px: a phone held upright fits them all; a short sideways screen scrolls */
    grid-template-rows: 16px repeat(10, minmax(22px, 1fr)) 4px repeat(3, minmax(22px, 1fr));
    gap: 3px;

  }
  /* SWIPE on: a finger on the cells paints instead of scrolling the page */
  .loop-grid-box.swiping .cell {
    touch-action: none;
  }
  .drums {
    grid-column: 1 / -1;
  }
  .step {
    text-align: center;
    font-size: 11px;
    line-height: 16px;
    border-radius: 4px;
  }
  .step.now {
    background: var(--accent);
    color: var(--surface);
  }
  .cell {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
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
