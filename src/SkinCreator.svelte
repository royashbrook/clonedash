<script lang="ts">
  import { catalog } from "./catalog.ts";
  // The SKINS screen (#107, docs/skins.md): saved skins, and a pixel editor for one. Nothing here
  // is saved or worn until SAVE or USE; every write goes through commit (skin.ts commitSkins).
  import { onMount } from "svelte";
  import { createState, object } from "./engine.ts";
  import { render, AVATAR } from "./render.ts";
  import {
    MAX_NAME,
    MIN_SIDE,
    MAX_SIDE,
    MAX_COLOURS,
    addSkin,
    cellAt,
    deleteSkin,
    dropsPixels,
    fillCells,
    fromCells,
    hitbox,
    isBlank,
    lineCells,
    paintThumb,
    resizeCells,
    saveSkin,
    skinArt,
    skinBox,
    skinName,
    toCells,
    wearSkin,
    type Skin,
    type SkinStore,
  } from "./skin.ts";
  import type { GameState, Level } from "./types.ts";

  let {
    store,
    broken,
    commit,
    confirm,
    share,
    importSkin,
    back,
    editing = $bindable(false),
  }: {
    store: SkinStore;
    broken: boolean;
    commit: (change: (latest: SkinStore) => void) => SkinStore;
    confirm: (title: string, text: string, yes: string, run: () => void) => void;
    share: (skin: Skin) => void;
    importSkin: () => void;
    back: () => void;
    // true while a skin is open: the app hides its bottom bar, so the only way out is the
    // creator's own back, which asks before dropping changes
    editing?: boolean;
  } = $props();

  // kid-friendly colours; "" is empty (see-through)
  const COLOURS: [string, string][] = [
    ["#9aff6b", "GREEN"],
    ["#2f9e44", "DARK GREEN"],
    ["#ffd166", "YELLOW"],
    ["#ffb477", "ORANGE"],
    ["#ff5c7a", "RED"],
    ["#ff8ac4", "PINK"],
    ["#c77dff", "PURPLE"],
    ["#53e3ff", "BLUE"],
    ["#2b4cff", "DARK BLUE"],
    ["#8b5a2b", "BROWN"],
    ["#ffd9b8", "PEACH"],
    ["#ffffff", "WHITE"],
    ["#b6c5d8", "LIGHT GREY"],
    ["#506275", "GREY"],
    ["#101825", "NAVY"],
    ["#000000", "BLACK"],
  ];
  // the 8x8 a new skin starts from: a template only, the default cube stays procedural
  const STARTER = [
    "WWWWWWWW",
    "WGGGGGGW",
    "WGNGGNGW",
    "WGNGGNGW",
    "WGGGGGGW",
    "WGNNNNGW",
    "WGGGGGGW",
    "WWWWWWWW",
  ]
    .join("")
    .split("")
    .map((c) => ({ W: "#ffffff", G: "#9aff6b", N: "#101825" })[c]!);
  const PREVIEW: Level = {
    name: "",
    length: 40,
    objects: [object("block", 6, 0), object("spike", 8, 0)],
  };

  let view = $state<"list" | "edit">("list");
  $effect(() => {
    editing = view !== "list";
  });
  let editingId = $state<number | null>(null),
    name = $state(""),
    width = $state(8),
    height = $state(8),
    cells = $state.raw<string[]>([]),
    tool = $state<"pencil" | "eraser" | "fill">("pencil"),
    colour = $state(COLOURS[0][0]),
    dirty = $state(false);
  let message = $state(""),
    failed = $state(false);
  let grid = $state<HTMLCanvasElement>(),
    gridBox = $state<HTMLDivElement>(),
    preview = $state<HTMLCanvasElement>(),
    cell = $state(24),
    reduced = $state(false),
    changed = $state(0); // cells the last stroke changed (each once, however often it was crossed)
  // A big picture fits as an overview. Tap an area to work on it at finger size instead
  // of trying to hit a single pixel in a phone-wide 100-column grid.
  const DETAIL = 12;
  let origin = $state<[number, number] | null>(null);
  const large = $derived(width > 32 || height > 32),
    cols = $derived(origin ? Math.min(DETAIL, width) : width),
    rows = $derived(origin ? Math.min(DETAIL, height) : height),
    padX = $derived(large && !origin ? Math.max(0, (44 - cols * cell) / 2) : 0),
    padY = $derived(large && !origin ? Math.max(0, (44 - rows * cell) / 2) : 0);
  let stroke: {
    pointer: number;
    last: [number, number] | null;
    seen: Set<number>;
  } | null = null;

  const draft = $derived.by(() => {
    try {
      return fromCells(name, width, height, cells);
    } catch {
      return null;
    }
  });
  const used = $derived(new Set(cells.filter(Boolean)));
  // colours from the + picker: any this skin uses that is not a swatch, and the one being drawn with
  const FIXED = new Set(COLOURS.map(([hex]) => hex));
  const customs = $derived([...new Set([...cells, colour].filter((c) => c && !FIXED.has(c)))]);

  function say(text: string, bad = false) {
    message = text;
    failed = bad;
  }
  function fail(cause: unknown) {
    say(cause instanceof Error ? cause.message : "That did not work.", true);
  }
  // one write; false when it was refused, the message says why and nothing changed
  function write(change: (latest: SkinStore) => void, done: string) {
    try {
      commit(change);
      say(done);
      return true;
    } catch (cause) {
      fail(cause);
      return false;
    }
  }

  function edit(id: number | null, skin?: Skin) {
    origin = null;
    editingId = id;
    name = skin ? skin.name : `My skin ${store.next}`.slice(0, MAX_NAME);
    width = skin?.width ?? 8;
    height = skin?.height ?? 8;
    cells = skin ? toCells(skin) : [...STARTER];
    tool = "pencil";
    dirty = false;
    say("");
    view = "edit";
  }
  function leave() {
    if (!dirty) {
      view = "list";
      say("");
      return;
    }
    confirm("Leave without saving?", "Your changes to this skin will be lost.", "LEAVE", () => {
      dirty = false;
      view = "list";
      say("");
    });
  }
  function save(wear: boolean) {
    let skin: Skin;
    try {
      skin = fromCells(name, width, height, cells);
    } catch (cause) {
      fail(cause);
      return;
    }
    if (wear && isBlank(skin)) {
      say("Draw at least one pixel before you wear a skin. You can still SAVE it as a draft.", true);
      return;
    }
    let id = 0;
    const was = editingId;
    if (
      write(
        (s) => {
          id = saveSkin(s, was, skin);
          if (wear) wearSkin(s, id);
        },
        wear ? "Saved. You are wearing it now." : "Saved.",
      )
    ) {
      if (was !== null && id !== was) say("Saved as a new skin (the old one was deleted in another tab).");
      editingId = id;
      dirty = false;
    }
  }

  // ---- painting ----
  function set(indices: number[], to: string) {
    if (to && !used.has(to) && used.size >= MAX_COLOURS) {
      say(`${MAX_COLOURS} colours is the most a skin can have. Erase one colour first.`, true);
      return 0;
    }
    const next = [...cells];
    let count = 0;
    for (const i of indices)
      if (next[i] !== to) {
        next[i] = to;
        count++;
      }
    if (count) {
      cells = next;
      dirty = true;
    }
    return count;
  }
  const ink = () => (tool === "eraser" ? "" : colour);
  function paint(path: [number, number][]) {
    if (!stroke) return;
    const fresh: number[] = [];
    for (const [x, y] of path) {
      const i = y * width + x;
      if (stroke.seen.has(i)) continue; // a revisited cell is not painted again
      stroke.seen.add(i);
      fresh.push(i);
    }
    if (fresh.length) changed += set(fresh, ink());
  }
  function endStroke() {
    if (!stroke) return;
    if (grid?.hasPointerCapture?.(stroke.pointer)) grid.releasePointerCapture(stroke.pointer);
    stroke = null;
  }
  function down(e: PointerEvent) {
    // a second finger, or any other pointer mid-stroke, ends the stroke and paints nothing
    if (stroke) {
      endStroke();
      return;
    }
    if (!e.isPrimary || e.button > 0) return;
    const at = pixelAt(e, grid!.getBoundingClientRect());
    if (!at) return;
    e.preventDefault();
    say("");
    if (large && !origin) {
      origin = [
        Math.max(0, Math.min(width - DETAIL, at[0] - Math.floor(DETAIL / 2))),
        Math.max(0, Math.min(height - DETAIL, at[1] - Math.floor(DETAIL / 2))),
      ];
      return; // the tap that opens an area never inks it
    }
    if (tool === "fill") {
      changed = set(fillCells(cells, width, height, at[0], at[1], colour), colour);
      return;
    }
    try {
      grid!.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser no longer tracks: the stroke still ends on its up or cancel */
    }
    stroke = { pointer: e.pointerId, last: at, seen: new Set() };
    changed = 0;
    paint([at]);
  }
  function move(e: PointerEvent) {
    if (!stroke || e.pointerId !== stroke.pointer) return;
    const box = grid!.getBoundingClientRect();
    // every sample the browser merged into this event, so a fast drag skips nothing
    const samples = e.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length ? samples : [e]) {
      const at = pixelAt(sample, box);
      if (!at) {
        stroke.last = null; // off the grid: the next cell back starts fresh, no line across
        continue;
      }
      paint(stroke.last ? lineCells(...stroke.last, ...at) : [at]);
      stroke.last = at;
    }
  }
  function up(e: PointerEvent) {
    if (stroke && e.pointerId === stroke.pointer) endStroke();
  }
  function pixelAt(e: PointerEvent, box: DOMRect): [number, number] | null {
    if (padX || padY) {
      // Even a 4x100 overview has a finger-wide target. Its padding picks the nearest edge.
      return [
        Math.max(0, Math.min(cols - 1, Math.floor((e.clientX - box.left - padX) / cell))),
        Math.max(0, Math.min(rows - 1, Math.floor((e.clientY - box.top - padY) / cell))),
      ];
    }
    const at = cellAt(e.clientX, e.clientY, box, cols, rows);
    return at && [at[0] + (origin?.[0] ?? 0), at[1] + (origin?.[1] ?? 0)];
  }

  function clear() {
    if (!used.size) return;
    confirm("Clear the whole picture?", "Every pixel goes back to empty.", "CLEAR", () => {
      set(cells.map((_, i) => i), "");
    });
  }
  function resize(w: number, h: number) {
    w = Math.max(MIN_SIDE, Math.min(MAX_SIDE, w));
    h = Math.max(MIN_SIDE, Math.min(MAX_SIDE, h));
    if (w === width && h === height) return;
    const apply = () => {
      endStroke();
      origin = null;
      cells = resizeCells(cells, width, height, w, h);
      width = w;
      height = h;
      dirty = true;
    };
    if (dropsPixels(cells, width, w, h))
      confirm("Make it smaller?", "Some of your drawing is outside the new size and will be cut off.", "CUT IT OFF", apply);
    else apply();
  }
  function enterSize(input: HTMLInputElement, isWidth: boolean) {
    const n = input.valueAsNumber;
    // A pending or cancelled cut must display the actual size until confirmed.
    input.value = String(isWidth ? width : height);
    if (!Number.isInteger(n) || n < MIN_SIDE || n > MAX_SIDE) {
      say(`Use a whole number from ${MIN_SIDE} to ${MAX_SIDE}.`, true);
      return;
    }
    resize(isWidth ? n : width, isWidth ? height : n);
  }

  // the grid redraws when its pixels or size change, never per frame
  function fitGrid() {
    if (!gridBox) return;
    const room = gridBox.clientWidth,
      tall = Math.min(innerHeight * 0.62, 460);
    cell = Math.max(1, Math.floor(Math.min(room / cols, tall / rows, 44)));
  }
  $effect(() => {
    void cols;
    void rows;
    void view;
    fitGrid();
  });
  $effect(() => {
    if (!grid) return;
    const dpr = Math.min(devicePixelRatio || 1, 3),
      w = cell * cols,
      h = cell * rows;
    grid.width = Math.round(w * dpr);
    grid.height = Math.round(h * dpr);
    const ctx = grid.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const sx = x + (origin?.[0] ?? 0), sy = y + (origin?.[1] ?? 0);
        ctx.fillStyle = cells[sy * width + sx] || ((sx + sy) % 2 ? "#26364a" : "#1b2939");
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    if (cell >= 8) {
      ctx.strokeStyle = "#ffffff22";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= cols; x++) {
        ctx.moveTo(x * cell + 0.5, 0);
        ctx.lineTo(x * cell + 0.5, h);
      }
      for (let y = 0; y <= rows; y++) {
        ctx.moveTo(0, y * cell + 0.5);
        ctx.lineTo(w, y * cell + 0.5);
      }
      ctx.stroke();
    }
  });

  // the preview: the game's own renderer, a little hop (still under reduced motion), the drawn
  // footprint and the unchanged body that collides
  function drawPreview(now: number) {
    if (!preview || !draft) return;
    const box = preview.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const t = reduced ? 0 : (now / 1000) % 1.6,
      hop = t < 0.6 ? 4 * 1.2 * (t / 0.6) * (1 - t / 0.6) : 0;
    const state: GameState = {
      ...createState(PREVIEW),
      x: 3,
      y: hop,
      grounded: hop === 0,
      time: t / 0.6, // one whole turn per hop, so it lands the way it took off
    };
    const art = skinArt(draft),
      scene = render(preview, {
        state,
        level: PREVIEW,
        reduced,
        skin: art,
        view: { width: box.width, height: box.height },
      });
    const ctx = preview.getContext("2d")!,
      X = (x: number) => (x - scene.camera) * scene.unit,
      Y = (y: number) => scene.floor - (y - scene.cameraY) * scene.unit,
      rect = (b: { left: number; right: number; bottom: number; top: number }) =>
        [X(b.left), Y(b.top), (b.right - b.left) * scene.unit, (b.top - b.bottom) * scene.unit] as const;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#9aff6b";
    ctx.strokeRect(...rect(skinBox(state, draft.width, draft.height, AVATAR)));
    ctx.strokeStyle = "#ffffff";
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(...rect(hitbox(state)));
    ctx.restore();
    // a magnified copy of the same rendered pixels around the cube, top right, so the boxes read
    // at phone size (nothing is redrawn for it)
    const span = 1.8 * scene.unit,
      zoom = Math.max(1, Math.min(4, Math.floor((box.height - 16) / span))),
      size = span * zoom,
      dpr = preview.width / box.width,
      [sx, sy] = [X(3 + 0.32) - span / 2, Y(0.6) - span / 2];
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(preview, sx * dpr, sy * dpr, span * dpr, span * dpr, box.width - size - 8, 8, size, size);
    ctx.strokeStyle = "#506275";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(box.width - size - 8.5, 7.5, size + 1, size + 1);
    ctx.restore();
  }

  onMount(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    reduced = motion.matches;
    const changeMotion = () => (reduced = motion.matches);
    motion.addEventListener("change", changeMotion);
    addEventListener("resize", fitGrid);
    let raf = 0;
    const frame = (now: number) => {
      if (view === "edit") drawPreview(now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      motion.removeEventListener("change", changeMotion);
      removeEventListener("resize", fitGrid);
      endStroke();
    };
  });

  function thumb(node: HTMLCanvasElement, skin: Skin) {
    paintThumb(node, skin);
    return { update: (next: Skin) => paintThumb(node, next) };
  }
</script>

<section id="skins" class="screen" aria-label="My skins">
  {#if view === "list"}
    <header class="home-head">
      <button id="skins-back" onclick={back}>← MENU</button>
      <h1>My skins</h1>
      <button id="new-skin" class="primary" onclick={() => edit(null)}>＋ NEW SKIN</button>
      <button id="import-skin" onclick={importSkin}>IMPORT SKIN</button>
    </header>
    <p class="skins-status">
      {broken
        ? "Your saved skins could not be read on this device. They were left as they are, and you are wearing the green cube."
        : "Saved on this device. A skin changes how your cube looks in cube mode. It never changes how it plays."}
    </p>
    <div id="skin-list">
      {#each catalog.skins as skin}
        <article class="skin-card"><div class="thumb"><canvas use:thumb={skin} aria-hidden="true"></canvas></div>
          <div class="skin-info"><h2>{skinName(skin)}</h2><p>Featured skin</p></div>
          <button disabled={broken} onclick={() => edit(null, skin)}>OPEN COPY</button></article>
      {/each}
      <article class="skin-card" class:worn={store.selected === undefined}>
        <div class="thumb default-thumb" aria-hidden="true"><span></span></div>
        <div class="skin-info">
          <h2>Green cube</h2>
          <p>The cube you start with.</p>
        </div>
        <div class="buttons">
          <button
            class="primary"
            aria-label="Use Green cube"
            disabled={store.selected === undefined}
            onclick={() => write((s) => wearSkin(s, null), "You are wearing the green cube.")}
            >{store.selected === undefined ? "WEARING" : "USE"}</button
          >
        </div>
      </article>
      {#each store.skins as { id, skin } (id)}
        <article class="skin-card" class:worn={store.selected === id}>
          <div class="thumb"><canvas use:thumb={skin} aria-hidden="true"></canvas></div>
          <div class="skin-info">
            <h2>{skinName(skin)}</h2>
            <p>{skin.width} × {skin.height} pixels{isBlank(skin) ? " · blank draft" : ""}</p>
          </div>
          <div class="buttons">
            <button
              class="primary"
              aria-label={`Use ${skinName(skin)}`}
              disabled={store.selected === id || isBlank(skin)}
              onclick={() => write((s) => wearSkin(s, id), `You are wearing ${skinName(skin)}.`)}
              >{store.selected === id ? "WEARING" : "USE"}</button
            ><button aria-label={`Edit ${skinName(skin)}`} onclick={() => edit(id, skin)}>EDIT</button
            ><button aria-label={`Share ${skinName(skin)}`} onclick={() => share(skin)}>SHARE</button
            ><button
              aria-label={`Copy ${skinName(skin)}`}
              onclick={() =>
                write(
                  (s) => addSkin(s, { ...skin, name: `${skinName(skin).slice(0, MAX_NAME - 7)} (copy)` }),
                  "Copied.",
                )}>COPY</button
            ><button
              aria-label={`Delete ${skinName(skin)}`}
              onclick={() =>
                confirm(
                  "Delete this skin?",
                  `Remove "${skinName(skin)}"? This cannot be undone.${store.selected === id ? " You will go back to the green cube." : ""}`,
                  "DELETE SKIN",
                  () => write((s) => deleteSkin(s, id), `"${skinName(skin)}" deleted.`),
                )}>DELETE</button
            >
          </div>
        </article>
      {/each}
    </div>
  {:else}
    <header class="home-head skin-head">
      <button id="skin-done" onclick={leave}>← SKINS</button>
      <label class="skin-name"
        ><span class="sr">Skin name</span><input
          id="skin-name"
          maxlength={MAX_NAME}
          bind:value={name}
          oninput={() => (dirty = true)}
          spellcheck="false"
          autocomplete="off"
        /></label
      >
      <button id="save-skin" onclick={() => save(false)}>SAVE</button>
      <button id="use-skin" class="primary" onclick={() => save(true)}>USE</button>
    </header>
    <div class="skin-editor">
      <div class="grid-box" bind:this={gridBox}>
        {#if large}
          {#if origin}
            <button id="skin-overview" onclick={() => { endStroke(); origin = null; }}>← WHOLE SKIN</button>
            <span class="hint">Columns {origin[0] + 1}–{origin[0] + cols} · rows {origin[1] + 1}–{origin[1] + rows}</span>
          {:else}
            <span class="hint">Tap the part you want to draw. It will zoom in.</span>
          {/if}
        {/if}
        <canvas
          id="skin-grid"
          bind:this={grid}
          style:width={`${cell * cols}px`}
          style:height={`${cell * rows}px`}
          style:padding={`${padY}px ${padX}px`}
          data-changed={changed}
          aria-label={large && !origin ? "Whole skin, tap an area to zoom in" : `Drawing grid, ${cols} wide and ${rows} tall`}
          onpointerdown={down}
          onpointermove={move}
          onpointerup={up}
          onpointercancel={up}
          onlostpointercapture={up}
        ></canvas>
      </div>
      <div class="skin-tools">
        <div class="tool-row" role="group" aria-label="Tools">
          {#each [["pencil", "✎ PENCIL"], ["eraser", "⌫ ERASER"], ["fill", "◧ FILL"]] as const as [id, label]}<button
              id={`tool-${id}`}
              aria-pressed={tool === id}
              onclick={() => (tool = id)}>{label}</button
            >{/each}<button id="clear-skin" onclick={clear}>CLEAR</button>
        </div>
        <div class="palette" role="group" aria-label="Colours">
          {#each COLOURS as [hex, label]}<button
              class="swatch"
              aria-label={label}
              aria-pressed={colour === hex && tool !== "eraser"}
              style:background={hex}
              onclick={() => {
                colour = hex;
                if (tool === "eraser") tool = "pencil";
              }}
            ></button>{/each}{#each customs as hex (hex)}<button
              class="swatch"
              aria-label={`CUSTOM ${hex.toUpperCase()}`}
              aria-pressed={colour === hex && tool !== "eraser"}
              style:background={hex}
              onclick={() => {
                colour = hex;
                if (tool === "eraser") tool = "pencil";
              }}
            ></button>{/each}<label class="swatch add" aria-label="ANY COLOUR"
            >＋<input
              id="custom-colour"
              type="color"
              value={colour && !FIXED.has(colour) ? colour : (customs.at(-1) ?? "#ffffff")}
              oninput={(e) => {
                colour = e.currentTarget.value.toLowerCase();
                if (tool === "eraser") tool = "pencil";
              }}
            /></label
          ><button
            class="swatch empty"
            aria-label="EMPTY"
            aria-pressed={colour === "" || tool === "eraser"}
            onclick={() => (colour = "")}
          ></button>
        </div>
        <div class="size-row">
          <span class="stepper"
            ><span class="size-label">WIDE</span>
            <button id="width-less" aria-label="Narrower" disabled={width <= MIN_SIDE} onclick={() => resize(width - 1, height)}>−</button>
            <input id="skin-width" type="number" inputmode="numeric" aria-label="Width in pixels" min={MIN_SIDE} max={MAX_SIDE} value={width} onchange={(e) => enterSize(e.currentTarget, true)} />
            <button id="width-more" aria-label="Wider" disabled={width >= MAX_SIDE} onclick={() => resize(width + 1, height)}>＋</button></span
          >
          <span class="stepper"
            ><span class="size-label">TALL</span>
            <button id="height-less" aria-label="Shorter" disabled={height <= MIN_SIDE} onclick={() => resize(width, height - 1)}>−</button>
            <input id="skin-height" type="number" inputmode="numeric" aria-label="Height in pixels" min={MIN_SIDE} max={MAX_SIDE} value={height} onchange={(e) => enterSize(e.currentTarget, false)} />
            <button id="height-more" aria-label="Taller" disabled={height >= MAX_SIDE} onclick={() => resize(width, height + 1)}>＋</button></span
          >
        </div>
        <canvas id="skin-preview" bind:this={preview} aria-label="Preview of your skin in the game"></canvas>
        <p class="hint">
          The green box is your picture. The dashed box is what bumps into things. It never changes.
          Your picture only changes the look.
        </p>
      </div>
    </div>
  {/if}
  <p id="skin-message" class:failed role="status" hidden={!message}>{message}</p>
</section>

<style>
  #skins {
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
  h1 {
    font-size: 32px;
    letter-spacing: -0.025em;
  }
  .skins-status {
    color: var(--ink-dim);
    margin: 20px 0;
    line-height: 1.5;
    font-size: 14px;
  }
  #skin-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 270px), 1fr));
    gap: 16px;
  }
  .skin-card {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 12px 16px;
    align-items: center;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
    min-width: 0;
  }
  .skin-card.worn {
    border-color: var(--accent);
  }
  .skin-card h2 {
    font-size: 18px;
    overflow-wrap: anywhere;
  }
  .skin-card p {
    font-size: 14px;
    color: var(--ink-dim);
    margin-top: 4px;
  }
  .skin-card .buttons {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .skin-card .buttons button {
    flex: 1;
    padding-inline: 10px;
    font-size: 13px;
  }
  .thumb {
    width: 64px;
    height: 64px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: repeating-conic-gradient(#26364a 0 25%, #1b2939 0 50%) 0 0 / 16px 16px;
  }
  .thumb canvas {
    max-width: 64px;
    max-height: 64px;
    image-rendering: pixelated;
  }
  .default-thumb span {
    width: 44px;
    height: 44px;
    background: var(--accent);
    border: 2px solid #fff;
  }
  .skin-head {
    gap: 8px;
    justify-content: flex-start;
  }
  .skin-name {
    flex: 1 1 140px;
    min-width: 0;
  }
  .skin-name input {
    width: 100%;
    min-height: 44px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-sunk);
    color: var(--ink);
    font-size: 16px; /* 16px keeps phones from zooming into the field */
  }
  .skin-editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 20px;
    margin-top: 16px;
    align-items: start;
  }
  .grid-box {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  #skin-grid {
    display: block;
    box-sizing: content-box;
    touch-action: none;
    /* no border to offset a drawing touch */
    outline: 1px solid var(--line);
    cursor: crosshair;
  }
  .skin-tools {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .tool-row,
  .size-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .tool-row button {
    flex: 1;
    padding-inline: 8px;
    font-size: 13px;
  }
  button[aria-pressed="true"] {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  .palette {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
    gap: 6px;
  }
  .swatch {
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    border-radius: 10px;
  }
  .swatch[aria-pressed="true"] {
    box-shadow:
      inset 0 0 0 3px var(--surface),
      0 0 0 3px var(--accent);
  }
  .swatch.add {
    position: relative;
    display: grid;
    place-items: center;
    border: 2px dashed var(--ink-dim);
    font: 700 22px var(--font-mono);
    color: var(--ink);
    cursor: pointer;
  }
  /* the native picker opens from a tap anywhere on the + swatch */
  .swatch.add input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }
  .swatch.empty {
    background: repeating-conic-gradient(#26364a 0 25%, #1b2939 0 50%) 0 0 / 14px 14px;
  }
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .size-row {
    gap: 8px 20px;
  }
  .size-label {
    font: 700 13px var(--font-mono);
    color: var(--ink-dim);
  }
  .size-row button {
    min-width: 44px;
    padding: 0;
    font-size: 20px;
  }
  .size-row input {
    width: 4.5rem;
    min-height: 44px;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    background: var(--surface-sunk);
    text-align: center;
    font: 800 16px var(--font-mono);
  }
  #skin-preview {
    display: block;
    width: 100%;
    height: 190px;
    border-radius: 12px;
    border: 1px solid var(--line);
  }
  .hint {
    font-size: 14px;
    color: var(--ink-dim);
    line-height: 1.5;
  }
  #skin-message {
    margin-top: 16px;
    color: var(--ink);
  }
  #skin-message.failed {
    color: var(--warn);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (max-width: 720px) {
    .skin-editor {
      grid-template-columns: minmax(0, 1fr);
    }
    h1 {
      font-size: 26px;
    }
  }
</style>
