<script lang="ts">
  import { onMount } from "svelte";
  import {
    blankLoop,
    decodeLoop,
    loopName,
    validateLoop,
    type Loop,
    type LoopStore,
  } from "./loop.ts";
  import {
    arrangement,
    duration,
    type Arrangement,
    type SongBook,
  } from "./arrangement.ts";
  import { playSong } from "./song-player.ts";
  let {
    book,
    broken,
    loops,
    commit,
    edit,
    confirm,
    toLoops,
  }: {
    book: SongBook;
    broken: boolean;
    loops: LoopStore;
    commit: (id: number | null, song: Arrangement | null) => number | null;
    edit: (loop: Loop, bpm: number, accept: (changed: Loop) => void) => void;
    confirm: (title: string, text: string, yes: string, go: () => void) => void;
    toLoops: () => void;
  } = $props();
  let draft = $state.raw<Arrangement | null>(null),
    id = $state<number | null>(null),
    dirty = $state(false);
  let message = $state(""),
    picker = $state(false),
    code = $state(""),
    importing = $state(false);
  let playing = $state(false),
    audio: AudioContext | undefined,
    stopAudio: (() => void) | undefined,
    token = 0,
    serial = 0;
  const title = (s: Arrangement) => s.name || "Untitled song";
  function clock(s: number) {
    const n = Math.round(s);
    return Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0");
  }
  export function silence() {
    token++;
    stopAudio?.();
    stopAudio = undefined;
    playing = false;
  }
  export function hasChanges() {
    return dirty;
  }
  export function list() {
    silence();
    serial++;
    draft = null;
    id = null;
    dirty = false;
    picker = false;
    importing = false;
    code = "";
    message = "";
  }
  function back() {
    silence();
    if (dirty)
      confirm(
        "Leave without saving?",
        "Your changes to this song will be lost.",
        "LEAVE",
        list,
      );
    else list();
  }
  function open(s?: Arrangement, key: number | null = null) {
    list();
    id = key;
    draft = s
      ? arrangement(s)
      : { name: "My song " + book.next, bpm: 150, sections: [] };
    picker = !s;
  }
  function update(next: Arrangement) {
    if (next.sections.length) arrangement(next);
    silence();
    draft = next;
    dirty = true;
    message = "";
  }
  function attempt(go: () => void) {
    try {
      go();
    } catch (e) {
      message = e instanceof Error ? e.message : "Could not make that change.";
    }
  }
  function add(loop: Loop) {
    update({
      ...draft!,
      sections: [...draft!.sections, { loop: validateLoop(loop), repeats: 1 }],
    });
    serial++;
    importing = false;
    picker = false;
    code = "";
  }
  async function paste() {
    const request = ++serial;
    importing = true;
    try {
      const loop = await decodeLoop(code);
      if (request === serial && draft && picker) add(loop);
    } catch (e) {
      if (request === serial) message = (e as Error).message;
    } finally {
      if (request === serial) importing = false;
    }
  }
  function section(
    i: number,
    action: "notes" | "copy" | "up" | "down" | "remove",
  ) {
    const s = draft!,
      parts = [...s.sections];
    silence();
    if (action === "notes") {
      edit(parts[i].loop, s.bpm, (changed) => {
        parts[i] = { ...parts[i], loop: validateLoop(changed) };
        update({ ...s, sections: parts });
      });
      return;
    }
    if (action === "copy")
      parts.splice(i + 1, 0, {
        ...parts[i],
        loop: validateLoop(parts[i].loop),
      });
    if (action === "remove") parts.splice(i, 1);
    if (action === "up" || action === "down") {
      const j = i + (action === "up" ? -1 : 1);
      [parts[i], parts[j]] = [parts[j], parts[i]];
    }
    update({ ...s, sections: parts });
  }
  async function hear(s: Arrangement, i = 0) {
    silence();
    const intent = token;
    playing = true;
    try {
      audio ??= new AudioContext();
      await audio.resume();
      if (intent !== token) return;
      const offset = duration({ ...s, sections: s.sections.slice(0, i) });
      stopAudio = playSong(audio, s, offset, false, () => {
        playing = false;
      });
    } catch (e) {
      if (intent === token) {
        silence();
        message = (e as Error).message;
      }
    }
  }
  onMount(() => {
    const hide = () => {
      if (document.hidden) silence();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      serial++;
      silence();
      document.removeEventListener("visibilitychange", hide);
      void audio?.close();
    };
  });
</script>

{#if !draft}
  <header class="home-head">
    <button onclick={toLoops}>← MY LOOPS</button>
    <h1>My songs</h1>
    <button class="primary" disabled={broken} onclick={() => open()}
      >＋ NEW SONG</button
    >
  </header>
  <p>
    Build a song from sections. Each section keeps its own copy of the notes.
  </p>
  {#if broken}<p role="alert">
      Your song library could not be read. Nothing was changed.
    </p>{/if}
  {#each book.entries as entry (entry.id)}
    <article>
      <strong>{title(entry.song)}</strong><small
        >{clock(duration(entry.song))} · {entry.song.bpm} BPM</small
      >
      <div>
        <button onclick={() => open(entry.song, entry.id)}>EDIT SONG</button
        ><button
          onclick={() => {
            silence();
            confirm("Delete song?", title(entry.song), "DELETE", () =>
              attempt(() => {
                commit(entry.id, null);
              }),
            );
          }}>DELETE</button
        >
      </div>
    </article>
  {:else}<p>No songs yet. Start with a loop you already made.</p>{/each}
{:else}
  <header class="home-head">
    <button onclick={back}>← MY SONGS</button>
    <h1>Song builder</h1>
    <button
      class="primary"
      disabled={!draft.sections.length}
      onclick={() =>
        attempt(() => {
          id = commit(id, draft);
          dirty = false;
          message = "Song saved.";
        })}>SAVE SONG</button
    >
  </header>
  <label
    >Song name <input
      maxlength="40"
      value={draft.name}
      oninput={(e) => update({ ...draft!, name: e.currentTarget.value })}
    /></label
  >
  <div class="row">
    <label
      >Tempo <select
        value={draft.bpm}
        onchange={(e) => {
          const el = e.currentTarget;
          attempt(() => update({ ...draft!, bpm: Number(el.value) }));
          el.value = String(draft!.bpm);
        }}
      >
        {#each Array.from({ length: 141 }, (_, i) => i + 60) as bpm}<option
            value={bpm}>{bpm} BPM</option
          >{/each}</select
      ></label
    >
    <strong>{clock(duration(draft))} / 4:00</strong>
    <button
      disabled={!draft.sections.length}
      onclick={() => (playing ? silence() : hear(draft!))}
      >{playing ? "■ STOP" : "▶ PLAY SONG"}</button
    >
  </div>
  {#each draft.sections as part, i}
    <article aria-label={"Section " + (i + 1)}>
      <strong>{i + 1}. {loopName(part.loop)}</strong>
      <div class="row">
        <button
          aria-label={"Play from section " + (i + 1)}
          onclick={() => hear(draft!, i)}>▶ FROM HERE</button
        >
        <label
          >Plays <input
            type="number"
            min="1"
            max="200"
            value={part.repeats}
            onchange={(e) => {
              const el = e.currentTarget;
              attempt(() =>
                update({
                  ...draft!,
                  sections: draft!.sections.map((s, j) =>
                    i === j ? { ...s, repeats: el.valueAsNumber } : s,
                  ),
                }),
              );
              el.value = String(draft!.sections[i].repeats);
            }}
          /></label
        >
      </div>
      <div class="row">
        <button onclick={() => section(i, "notes")}>EDIT NOTES</button><button
          onclick={() => attempt(() => section(i, "copy"))}>DUPLICATE</button
        >
        <button
          aria-label="Move up"
          disabled={!i}
          onclick={() => section(i, "up")}>↑</button
        ><button
          aria-label="Move down"
          disabled={i === draft.sections.length - 1}
          onclick={() => section(i, "down")}>↓</button
        >
        <button
          onclick={() => {
            silence();
            confirm(
              "Remove section?",
              "The original loop stays in My loops.",
              "REMOVE",
              () => section(i, "remove"),
            );
          }}>REMOVE</button
        >
      </div>
    </article>
  {/each}
  <button
    onclick={() => {
      silence();
      serial++;
      importing = false;
      picker = !picker;
    }}>{picker ? "CLOSE PICKER" : "＋ ADD SECTION"}</button
  >
  {#if picker}
    <article>
      <strong>Add a section</strong>
      <label
        >My loops <select
          aria-label="Choose saved loop"
          onchange={(e) => {
            const el = e.currentTarget;
            const entry = loops.loops.find((x) => x.id === Number(el.value));
            if (entry) attempt(() => add(entry.loop));
            el.value = "";
          }}
        >
          <option value="">Choose a saved loop…</option
          >{#each loops.loops as e}<option value={e.id}
              >{loopName(e.loop)}</option
            >{/each}</select
        ></label
      >
      <label
        >Shared loop code or link <input
          bind:value={code}
          placeholder="cdm1… or a loop link"
        /></label
      >
      <div class="row">
        <button disabled={!code.trim() || importing} onclick={paste}
          >IMPORT LOOP</button
        >
        <button
          onclick={() =>
            attempt(() =>
              add({
                ...blankLoop(),
                name: "Section " + (draft!.sections.length + 1),
                kick: [],
                hat: [],
                snare: [],
              }),
            )}>＋ BLANK SECTION</button
        >
      </div>
    </article>
  {/if}
{/if}
<p role="status">{message}</p>

<style>
  header,
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  article {
    display: grid;
    gap: 8px;
    padding: 12px;
    margin: 10px 0;
    background: var(--surface-raised);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  label {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin: 8px 0;
  }
  input,
  select {
    min-width: 0;
    max-width: 100%;
    min-height: 44px;
    padding: 6px;
    font: inherit;
    color: var(--ink);
    background: var(--surface-sunk);
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  input[type="number"] {
    width: 5em;
  }
  strong {
    overflow-wrap: anywhere;
  }
  p {
    margin: 10px 0;
    color: var(--ink-dim);
  }
</style>
