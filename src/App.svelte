<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    createState,
    object,
    transform,
    validateLevel,
    bounds,
    duplicateObject,
    levelHeight,
    MAX_LENGTH,
  } from "./engine.ts";
  import { LEVELS, COLLECTIONS, COURSE_ORDER, courseSong } from "./levels.ts";
  import { render } from "./render.ts";
  import { Run } from "./run.ts";
  import { Soundtrack, TRACKS, trackName } from "./music.ts";
  import { RECORDINGS } from "./recordings.ts";
  import {
    SAVE,
    readSave,
    storeDraft,
    selectLevel,
    newLevel,
  } from "./library.ts";
  import { installControl } from "./install.ts";
  import { updateControl } from "./pwa.ts";
  import LevelTransfer from "./LevelTransfer.svelte";
  import { importLevel } from "./transfer.ts";
  import type { Level, ObjectType, Transform } from "./types.ts";

  type Screen = "home" | "library" | "editor" | "play";
  type Action = [label: string, handler: () => void, primary?: boolean];
  type Sheet = {
    title: string;
    text: string;
    actions: Action[];
    closable: boolean;
    extra?: "about" | "settings" | "transfer";
  };
  const choices = {
    blocks: [
      ["block", "■ SOLID"],
      ["grid", "▦ GRID"],
      ["black", "■ BLACK"],
      ["outline", "□ OUTLINE"],
      ["plain-black", "■ NO BORDER"],
    ],
    spikes: [
      ["spike", "▲ FULL"],
      ["half", "▴ HALF"],
      ["small", "▴ ⅔ SIZE"],
      ["quarter", "▴ ¼ SIZE"],
    ],
    portals: [
      ["plane", "▷ PLANE"],
      ["square", "□ SQUARE"],
      ["wheel", "⊙ WHEEL"],
      ["jumper", "⇈ JUMPER"],
    ],
    gravity: [
      ["gravity-up", "↑ UPSIDE DOWN"],
      ["gravity-down", "↓ NORMAL"],
    ],
    rings: [["ring", "◉ JUMP RING"]],
    ramp: [
      ["ramp", "◩ SOLID"],
      ["ramp-grid", "◩ GRID"],
      ["ramp-black", "◩ BLACK"],
    ],
  } satisfies Record<string, [ObjectType, string][]>;
  type Tab = keyof typeof choices;
  const tabs = Object.keys(choices) as Tab[];
  const transforms: [Transform, string, string][] = [
    ["left", "←", "Move left"],
    ["right", "→", "Move right"],
    ["up", "↑", "Move up"],
    ["down", "↓", "Move down"],
    ["ccw", "↶ 90°", "Rotate anticlockwise"],
    ["cw", "↷ 90°", "Rotate clockwise"],
    ["flipX", "FLIP ↔", "FLIP ↔"],
    ["flipY", "FLIP ↕", "FLIP ↕"],
  ];
  const initialSave = readSave(null, LEVELS.length);
  const attract = { ...createState(LEVELS[0]), x: 9, y: 1.3, grounded: false };
  let save = $state.raw(initialSave);
  let storageOK = $state(true);
  let draft = $state.raw(structuredClone(initialSave.draft));
  let mode = $state<Screen>("home"),
    current = $state(0),
    custom = $state(false);
  let selected = $state(-1),
    tool = $state<ObjectType | "select">("block"),
    tab = $state<Tab>("blocks");
  let layer = $state("play"),
    stepSize = $state(1),
    pan = $state(0),
    panY = $state(0);
  let portrait = $state(false),
    paused = false,
    run = new Run(LEVELS[0]);
  let hud = $state({
    label: "",
    progress: 0,
    attempt: 1,
    cue: "",
    detail: "",
    showCue: false,
  });
  let notice = $state(""),
    panel = $state.raw<Sheet | null>(null),
    installVisible = $state(false),
    updateReady = $state(false),
    updating = $state(false);
  let transfer = $state.raw<{ level?: Level; initial?: string }>({});
  let canvas: HTMLCanvasElement,
    dialog: HTMLDialogElement,
    editorHead: HTMLElement,
    editorControls: HTMLDivElement;
  let music = new Soundtrack(),
    audio: AudioContext | undefined;
  let installer: ReturnType<typeof installControl> | undefined,
    updater: ReturnType<typeof updateControl> | undefined;
  let last = 0,
    raf = 0,
    alive = false,
    toastTimer: number | undefined;
  const timers = new Set<number>();
  let reduced = false;
  const completed = $derived(
    LEVELS.filter((_, i) => save.best[i] === 100).length,
  );
  const rotate = $derived(portrait && (mode === "play" || mode === "editor"));
  const selection = $derived(draft.objects[selected]);
  const draftSong = () => draft.song ?? 8 + save.activeLevel;
  const songs = $derived([
    ...new Set([
      ...RECORDINGS.map((song) => song.id),
      ...TRACKS.map((_, i) => i),
      ...save.customLevels.map((e) => 8 + e.id),
      draft.song ?? 8 + save.activeLevel,
    ]),
  ]);
  function later(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
    return id;
  }
  function toast(text: string) {
    notice = text;
    clearTimeout(toastTimer);
    toastTimer = later(() => (notice = ""), 4200);
  }
  function persist() {
    if (storageOK)
      try {
        localStorage.setItem(SAVE, JSON.stringify(save));
      } catch {
        storageOK = false;
      }
    save = {
      ...save,
      best: { ...save.best },
      customLevels: save.customLevels.map((entry) => ({ ...entry })),
    };
    if (!storageOK)
      toast("Storage unavailable. You can still play; progress is not saved.");
  }
  function tone(freq: number, duration = 0.08, volume = 0.03) {
    if (!save.sound || document.hidden || !alive) return;
    try {
      audio ??= new AudioContext();
      void audio.resume();
      const osc = audio.createOscillator(),
        gain = audio.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audio.currentTime + duration,
      );
      osc.connect(gain).connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + duration);
    } catch {
      /* Audio is optional. */
    }
  }
  function toggleSound() {
    save = { ...save, sound: !save.sound };
    persist();
    music.unlock(save.sound);
  }
  function nextTrail() {
    current = COURSE_ORDER.find((i) => save.best[i] !== 100) ?? COURSE_ORDER[0];
  }
  function setMode(next: Screen) {
    mode = next;
    document.body.dataset.mode = next;
    run.interrupt();
    orientation();
  }
  function closeSheet() {
    panel = null;
    dialog?.close();
  }
  async function sheet(
    title: string,
    text: string,
    actions: Action[] = [],
    closable = true,
    extra?: Sheet["extra"],
  ) {
    const next = { title, text, actions, closable, extra };
    panel = next;
    await tick();
    if (alive && panel === next && !dialog.open) dialog.showModal();
  }
  function record() {
    if (custom) return;
    const s = run.state;
    const percent =
      s.status === "complete"
        ? 100
        : Math.min(99, Math.floor(((s.x - 1) / (s.level.length - 1)) * 100));
    if (percent > (save.best[current] || 0)) {
      save.best[current] = percent;
      persist();
    }
  }
  function home() {
    closeSheet();
    if (mode === "play") record();
    paused = false;
    setMode("home");
    nextTrail();
  }
  function library() {
    closeSheet();
    paused = false;
    setMode("library");
  }
  function sharing(level?: Level, initial = "") {
    library();
    transfer = { level, initial };
    void sheet(
      level ? "Share level" : "Import level",
      "",
      [],
      true,
      "transfer",
    );
  }
  function receiveLevel() {
    const params = new URLSearchParams(location.hash.slice(1));
    if (!params.has("level")) return;
    const initial = location.href;
    history.replaceState(null, "", location.pathname + location.search);
    sharing(undefined, initial);
  }
  function addSharedLevel(level: Level) {
    if (!storageOK)
      throw Error(
        "Storage is unavailable. Enable it before importing a level.",
      );
    save = importLevel(localStorage, save, level, LEVELS.length);
    draft = structuredClone(save.draft);
    library();
    toast("Level added. Find it in My Levels.");
  }
  function start(index: number, isCustom = false) {
    music.unlock(save.sound);
    music.stop();
    current = index;
    custom = isCustom;
    run = new Run(isCustom ? draft : LEVELS[index]);
    paused = false;
    closeSheet();
    setMode("play");
    snapshot();
    tone(523, 0.1);
  }
  function copyPlayedLevel() {
    try {
      if (!storageOK)
        throw Error(
          "Storage is unavailable. Your current level was not replaced.",
        );
      const source = run.state.level;
      // Import uses a fresh storage read, a new ID, and verified writes. Only then
      // select the copy; the previous draft remains in its original library slot.
      save = importLevel(
        localStorage,
        save,
        {
          ...source,
          name: `${source.name.slice(0, 33)} (copy)`,
          song: custom ? draftSong() : courseSong(current),
        },
        LEVELS.length,
        true,
      );
      draft = structuredClone(save.draft);
      selected = -1;
      pan = panY = 0;
      openEditor();
      toast("Your copy is saved in My Levels. The original is unchanged.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Cannot copy level.";
      if (panel) panel = { ...panel, text: message };
      else toast(message);
    }
  }
  function resume() {
    closeSheet();
    paused = false;
    run.interrupt();
    last = performance.now();
    orientation();
  }
  function pause() {
    if (mode !== "play" || run.state.status === "complete") return;
    run.interrupt();
    paused = true;
    music.stop();
    void sheet(
      "Paused",
      "Your run is right where you left it.",
      [
        ["RESUME", resume, true],
        [
          "RESTART LEVEL",
          () => {
            closeSheet();
            run.attempt++;
            run.reset();
            music.stop();
            paused = false;
            orientation();
            snapshot();
          },
        ],
        [custom ? "BACK TO EDITOR" : "MAIN MENU", custom ? openEditor : home],
        ["EDIT A COPY", copyPlayedLevel],
        ...(custom ? [["MY LEVELS", library] as Action] : []),
      ],
      false,
    );
  }
  function orientation() {
    portrait = innerHeight > innerWidth;
    if (portrait && mode === "play") {
      paused = true;
      run.interrupt();
      music.stop();
      closeSheet();
    } else if (
      mode === "play" &&
      paused &&
      !panel &&
      run.state.status === "playing"
    )
      pause();
  }
  function interrupt() {
    pause();
    run.interrupt();
    music.stop();
    void audio?.suspend();
  }
  function complete() {
    record();
    run.release();
    tone(784, 0.2);
    later(() => tone(1047, 0.3), 130);
    const actions: Action[] = custom
      ? [
          ["BACK TO EDITOR", openEditor, true],
          ["MY LEVELS", library],
          ["Restart Level", () => start(current, true)],
          ["Main Menu", home],
          ["EDIT A COPY", copyPlayedLevel],
        ]
      : [
          ["Main Menu", home, true],
          ["Restart Level", () => start(current)],
          ["EDIT A COPY", copyPlayedLevel],
          ...(COURSE_ORDER.indexOf(current) < COURSE_ORDER.length - 1
            ? [
                [
                  "NEXT TRAIL",
                  () => start(COURSE_ORDER[COURSE_ORDER.indexOf(current) + 1]),
                ] as Action,
              ]
            : []),
        ];
    void sheet(
      "Level Complete!",
      custom
        ? "Your trail works. Keep building!"
        : `${run.state.level.name} cleared. Nice flow.`,
      actions,
      false,
    );
  }
  function press() {
    if (mode !== "play" || paused || rotate || panel) return;
    run.press();
    tone(440, 0.045, 0.018);
    snapshot();
  }
  function pointerdown(e: PointerEvent) {
    if (mode === "editor") {
      editAt(e);
      return;
    }
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    press();
  }
  function keydown(e: KeyboardEvent) {
    if (
      e.target instanceof HTMLElement &&
      ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)
    )
      return;
    if (e.code === "Space" || e.code === "ArrowUp") {
      if (mode === "play") {
        e.preventDefault();
        if (!e.repeat) press();
      }
    }
    if (e.code === "Escape" && mode === "play" && !panel) pause();
    if (mode === "editor" && selected >= 0 && !panel) {
      const keys: Record<string, Transform> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
      };
      const key = keys[e.code];
      if (key) {
        e.preventDefault();
        adjust(key);
      }
      if (e.code === "Delete" || e.code === "Backspace") {
        e.preventDefault();
        deleteSelected();
      }
    }
  }
  function snapshot() {
    const s = run.state;
    const next = {
      label: `${s.level.name} · ${s.mode.toUpperCase()} ${s.gravity > 0 ? "↑" : "↓"}`,
      progress: Math.min(100, ((s.x - 1) / (s.level.length - 1)) * 100),
      attempt: run.attempt,
      cue:
        s.mode === "plane"
          ? "HOLD TO FLY"
          : s.mode === "wheel"
            ? "TAP TO FLIP GRAVITY"
            : "TAP TO JUMP",
      detail:
        s.mode === "plane"
          ? "RELEASE TO FALL"
          : s.mode === "wheel"
            ? "LAND FIRST · THEN TAP"
            : s.mode === "jumper"
              ? "TAP AGAIN IN MIDAIR"
              : "HOLD TO KEEP JUMPING",
      showCue:
        !paused &&
        !rotate &&
        !run.learned &&
        s.time <= run.cueUntil &&
        s.status === "playing",
    };
    if (
      Object.keys(next).some(
        (key) =>
          next[key as keyof typeof next] !== hud[key as keyof typeof hud],
      )
    )
      hud = next;
  }
  function draw() {
    const level =
      mode === "editor" ? draft : mode === "play" ? run.state.level : LEVELS[0];
    return render(canvas, {
      level,
      state: mode === "play" ? run.state : mode === "home" ? attract : null,
      camera: mode === "editor" ? pan : mode === "play" ? run.camera : 0,
      cameraY: mode === "editor" ? panY : mode === "play" ? run.cameraY : 0,
      editing: mode === "editor",
      layer,
      selected,
      time: run.deathTime,
      reduced,
      areaTop:
        mode === "editor" ? editorHead.getBoundingClientRect().bottom : 0,
      areaBottom:
        mode === "editor"
          ? editorControls.getBoundingClientRect().top
          : undefined,
    });
  }
  function frame(now: number) {
    if (!alive) return;
    if (music.fallback) {
      music.fallback = false;
      toast("Recording unavailable. Playing an original soundtrack instead.");
    }
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (mode === "play" && !paused && !rotate && !document.hidden) {
      const event = run.advance(dt);
      if (event.died) {
        record();
        tone(90, 0.16);
      }
      if (event.restarted) music.stop();
      if (event.complete) complete();
    }
    music.sync(
      mode === "editor" || (mode === "play" && custom)
        ? draftSong()
        : mode === "play"
          ? courseSong(current)
          : 109,
      !document.hidden &&
        (mode === "home" ||
          mode === "library" ||
          (mode === "editor" && !rotate) ||
          (mode === "play" &&
            !paused &&
            !rotate &&
            run.state.status === "playing" &&
            run.readyTime <= 0)),
      mode === "play" ? run.state.time : now / 1000,
    );
    draw();
    if (mode === "play") snapshot();
    raf = requestAnimationFrame(frame);
  }
  function saveDraft() {
    try {
      storeDraft(save, draft);
      persist();
    } catch {
      toast(
        "Keep objects inside the trail, after the start and before the finish.",
      );
    }
    draft = { ...draft, objects: [...draft.objects] };
  }
  function openEditor() {
    closeSheet();
    paused = false;
    setMode("editor");
  }
  function loadCustom(id: number) {
    draft = selectLevel(save, id);
    selected = -1;
    pan = 0;
    panY = 0;
    persist();
  }
  function createLevel() {
    try {
      draft = newLevel(save);
      selected = -1;
      pan = 0;
      panY = 0;
      persist();
      openEditor();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Cannot create level.");
    }
  }
  function changeHeight(e: Event) {
    const input = e.currentTarget as HTMLInputElement,
      n = Number(input.value);
    try {
      validateLevel({ ...draft, height: n });
    } catch {
      input.value = String(levelHeight(draft));
      toast("Height must be 7–40 whole blocks and include every object.");
      return;
    }
    draft = { ...draft, height: n };
    panY = Math.min(panY, n - 7);
    saveDraft();
  }
  function changeLength(e: Event) {
    const input = e.currentTarget as HTMLInputElement,
      n = Number(input.value);
    if (
      n < 20 ||
      n > MAX_LENGTH ||
      !Number.isFinite(n) ||
      draft.objects.some((o) => o.x > n - 2)
    ) {
      input.value = String(draft.length);
      toast(`Length must be 20–${MAX_LENGTH} and include every object.`);
      return;
    }
    draft = { ...draft, length: n };
    pan = Math.min(pan, n - 8);
    saveDraft();
  }
  function chooseTab(next: Tab) {
    tab = next;
    tool = choices[next][0][0];
  }
  function editAt(e: PointerEvent) {
    if (rotate || panel) return;
    const view = draw(),
      x = view.x(e.clientX),
      y = view.y(e.clientY);
    if (y < 0 || y >= levelHeight(draft)) return;
    const activeLayer = layer === "background" ? "background" : undefined;
    if (tool === "select") {
      selected = draft.objects.findLastIndex((o) => {
        const b = bounds(o);
        return (
          o.layer === activeLayer &&
          x >= b.left - 0.2 &&
          x <= b.right + 0.2 &&
          y >= b.bottom - 0.2 &&
          y <= b.top + 0.2
        );
      });
      return;
    }
    const ox = Math.round(x / stepSize) * stepSize,
      oy = Math.floor(y / stepSize) * stepSize;
    if (ox < 3 || ox > draft.length - 2) {
      toast("Leave three blocks at the start and two at the finish.");
      return;
    }
    if (draft.objects.length >= 600) {
      toast("This trail has reached 600 objects.");
      return;
    }
    const existing = draft.objects.findIndex(
      (o) => o.layer === activeLayer && o.x === ox && o.y === oy,
    );
    if (existing >= 0) {
      selected = existing;
      return;
    }
    const piece = object(
      tool,
      Math.round(ox * 20) / 20,
      Math.round(oy * 20) / 20,
    );
    if (activeLayer) piece.layer = activeLayer;
    try {
      validateLevel({ ...draft, objects: [...draft.objects, piece] });
    } catch {
      toast(
        "That piece extends above the ceiling. Increase the height or place it lower.",
      );
      return;
    }
    draft.objects.push(piece);
    selected = draft.objects.length - 1;
    saveDraft();
  }
  function adjust(action: Transform) {
    if (selected < 0) return;
    const piece = structuredClone(draft.objects[selected]);
    transform(piece, action, stepSize);
    const next = {
      ...draft,
      objects: draft.objects.map((o, i) => (i === selected ? piece : o)),
    };
    try {
      validateLevel(next);
    } catch {
      toast("That would move the object outside the trail.");
      return;
    }
    draft = next;
    saveDraft();
  }
  function deleteSelected() {
    if (selected < 0) return;
    draft.objects.splice(selected, 1);
    selected = -1;
    saveDraft();
  }
  function duplicate() {
    try {
      draft.objects.push(duplicateObject(draft, selected));
      selected = draft.objects.length - 1;
      saveDraft();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Cannot copy object.");
    }
  }
  function deleteAll() {
    if (draft.objects.length)
      void sheet(
        "Delete all objects?",
        `Remove all ${draft.objects.length} objects from this draft? This cannot be undone. Your completed trails will stay.`,
        [
          ["CANCEL", closeSheet, true],
          [
            "DELETE ALL OBJECTS",
            () => {
              draft.objects = [];
              selected = -1;
              saveDraft();
              closeSheet();
            },
          ],
        ],
        false,
      );
  }
  function how() {
    void sheet(
      "One button. Find your flow.",
      "Square: tap or press Space to jump onto two-block ledges. Hold for another jump when you land. Jumper: same as square, but every fresh tap lets you jump again in midair. Jump before a wall to clear it. Try Air Steps! Plane: hold to fly against gravity; release to fall. Landings and ceiling contact are safe while flying, but wall impacts kill. Wheel: land on a block, floor or ceiling, then tap or press Space to flip gravity. Midair taps are ignored; holding does not flip again when you land. UP and DOWN portals set gravity without changing your shape. Under upside-down gravity, land and jump on ceilings. All spikes kill, including the tiny quarter-size ones. Outline blocks are transparent but solid. Hitting a wall kills in ALL modes, including the vertical face of a ramp. Your smaller hazard hitbox still forgives edge grazes. Background blocks never collide. Rings: tap or press Space while reaching a glowing ring for a midair jump, once per ring per run. Ramps: walk up or down the white diagonal slope. Find RINGS and RAMP tabs in the editor.",
    );
  }
  async function applyUpdate() {
    if (mode === "play") pause();
    updating = true;
    try {
      await updater?.apply();
    } catch {
      toast(
        "Update could not download. Your current game is still ready. Try again online.",
      );
    } finally {
      updating = false;
    }
  }
  onMount(() => {
    alive = true;
    try {
      save = readSave(localStorage.getItem(SAVE), LEVELS.length);
    } catch {
      storageOK = false;
    }
    draft = structuredClone(save.draft);
    nextTrail();
    orientation();
    document.body.dataset.mode = mode;
    if (!storageOK) persist();
    const abort = new AbortController(),
      signal = abort.signal,
      motion = matchMedia("(prefers-reduced-motion: reduce)");
    reduced = motion.matches;
    motion.addEventListener("change", () => (reduced = motion.matches), {
      signal,
    });
    window.addEventListener("resize", orientation, { signal });
    window.addEventListener("pagehide", interrupt, { signal });
    window.addEventListener("blur", interrupt, { signal });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) interrupt();
        else void updater?.check();
      },
      { signal },
    );
    window.addEventListener("keydown", keydown, { signal });
    window.addEventListener("hashchange", receiveLevel, { signal });
    window.addEventListener(
      "keyup",
      (e) => {
        if (e.code === "Space" || e.code === "ArrowUp") run.release();
      },
      { signal },
    );
    canvas.addEventListener("pointerdown", pointerdown, { signal });
    for (const event of ["pointerup", "lostpointercapture"])
      canvas.addEventListener(event, () => run.release(), { signal });
    canvas.addEventListener("pointercancel", () => run.interrupt(), { signal });
    installer = installControl(
      (value) => (installVisible = value),
      () => {
        void sheet(
          "Install Clone Dash",
          "In Safari, tap Share, then Add to Home Screen, then Add. Your game will open full-screen and work offline after its first load.",
        );
      },
    );
    updater = updateControl(() => (updateReady = true));
    const requested = Number(new URLSearchParams(location.search).get("level"));
    if (
      requested >= 1 &&
      requested <= LEVELS.length &&
      Number.isInteger(requested)
    )
      start(requested - 1);
    receiveLevel();
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      abort.abort();
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      timers.clear();
      installer?.dispose();
      updater?.dispose();
      music.dispose();
      void audio?.close();
      dialog.close();
      delete document.body.dataset.mode;
    };
  });
</script>

{#snippet updateButton()}
  <button
    id="update"
    hidden={!updateReady}
    disabled={updating}
    onclick={applyUpdate}
    >{updating
      ? "DOWNLOADING UPDATE…"
      : "NEW VERSION READY · TAP TO UPDATE"}</button
  >
  <p id="notice" role="status" hidden={!notice}>{notice}</p>
{/snippet}

<canvas
  id="world"
  bind:this={canvas}
  aria-label="Clone Dash playfield. Space or touch to jump, hold to fly, tap to flip wheel gravity."
></canvas>
<span class="version" aria-label="App version">v{__APP_VERSION__}</span>
<main id="home" class="screen" hidden={mode !== "home"}>
  <header class="home-head">
    <a
      class="brand"
      href="/"
      aria-label="Clone Dash home"
      onclick={(e) => {
        e.preventDefault();
        home();
      }}><img src="/icon.svg" alt="" width="44" height="44" />CLONE DASH</a
    ><button
      id="sound"
      aria-label={save.sound ? "Turn sound off" : "Turn sound on"}
      onclick={toggleSound}>{save.sound ? "SOUND ON" : "SOUND OFF"}</button
    >
  </header>
  <section class="home-content">
    <div class="intro">
      <p class="eyebrow">ONE BUTTON. {LEVELS.length} TRAILS.</p>
      <h1>Find your<br /><span>flow.</span></h1>
      <p>
        Jump the spikes. Flip the world.<br />Then build your own impossible.
      </p>
      <button id="play" class="primary big" onclick={() => start(current)}
        >PLAY {LEVELS[current].name.toUpperCase()} <span>▶</span></button
      >
      <p id="progress-copy" class="fine">
        {completed
          ? `${completed} trails complete. Every trail is always open.`
          : "Your first jump starts here."}
      </p>
    </div>
    <div class="level-panel">
      <h2>
        Pick your trail <span id="stars">{completed} / {LEVELS.length}</span>
      </h2>
      <div id="levels">
        {#each COLLECTIONS as collection}
          <h3 class="course-heading">
            {collection.name}<small>{collection.note}</small>
          </h3>
          {#each collection.indices as i}
            {@const level = LEVELS[i]}
            <button
              class="level-card"
              aria-label={`Play ${level.name}`}
              onclick={() => start(i)}
              ><span class="number"
                >{collection.name === "Warmups"
                  ? `W${i + 1}`
                  : String(COURSE_ORDER.indexOf(i) + 1).padStart(2, "0")}</span
              ><span class="title"
                >{level.name}<small>{level.note}</small><span
                  class="course-meta"
                  >{collection.name} · {Math.round(
                    (level.length - 1) / 5,
                  )}s</span
                ></span
              ><span class="score"
                >{save.best[i] === 100 ? "✓" : `${save.best[i] || 0}%`}</span
              ></button
            >{/each}
        {/each}
      </div>
    </div>
  </section>
  <footer>
    <button id="my-levels" onclick={library}
      ><svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"
        ><path
          d="M5 17H27V29H5Z M9 17 16 3 23 17"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linejoin="round"
        /></svg
      > MY LEVELS</button
    ><button id="editor-open" onclick={openEditor}>＋ LEVEL EDITOR</button
    ><button id="how" onclick={how}>HOW TO PLAY</button><button
      id="install"
      hidden={!installVisible}
      onclick={() => installer?.prompt()}>INSTALL</button
    ><button
      id="about"
      onclick={() =>
        sheet(
          "Clone Dash",
          `${LEVELS.length} one-button trails, from warmups to hard, and a place to build your own. An original geometric platformer inspired by Geometry Dash, made from a kid’s game idea.`,
          [],
          true,
          "about",
        )}>ABOUT</button
    >
  </footer>
</main>
<section id="library" class="screen" hidden={mode !== "library"}>
  <header class="home-head">
    <button id="library-back" onclick={home}>← MENU</button>
    <h1>My levels</h1>
    <button id="new-level" class="primary" onclick={createLevel}
      >＋ NEW LEVEL</button
    >
    <button id="import-level" onclick={() => sharing()}>IMPORT LEVEL</button>
  </header>
  <p id="library-status">
    {storageOK
      ? "Saved on this device. Each new level gets its own original song."
      : "NOT SAVED · storage unavailable. Keep this page open to keep your work."}
  </p>
  <div id="custom-levels">
    {#each save.customLevels as { id, level } (id)}<article class="custom-card">
        <h2>{level.name}</h2>
        <p>
          {level.length} × {levelHeight(level)} blocks · {level.objects.length} pieces
          · ♪ {trackName(level.song ?? 8 + id)}
        </p>
        <div class="buttons">
          <button
            class="primary"
            aria-label={`Play ${level.name}`}
            onclick={() => {
              loadCustom(id);
              start(0, true);
            }}>▶ PLAY</button
          ><button
            aria-label={`Edit ${level.name}`}
            onclick={() => {
              loadCustom(id);
              openEditor();
            }}>EDIT</button
          >
          <button
            aria-label={`Share ${level.name}`}
            onclick={() => sharing({ ...level, song: level.song ?? 8 + id })}
            >SHARE</button
          >
        </div>
      </article>{/each}
  </div>
</section>
<section id="hud" hidden={mode !== "play"}>
  <button
    id="menu"
    class:back-to-levels={custom}
    aria-label={custom ? "Return to My Levels" : "Pause and open menu"}
    onclick={() => (custom ? library() : pause())}
    >{custom ? "← MY LEVELS" : "☰"}</button
  >
  <div class="run-label">
    <span id="level-name">{hud.label}</span><progress
      id="run-progress"
      max="100"
      value={hud.progress}
      aria-label="Level progress"
    ></progress>
  </div>
  <span id="attempt">TRY {hud.attempt}</span><button
    id="pause"
    aria-label="Pause"
    onclick={pause}>Ⅱ</button
  >
</section>
<div id="cue" hidden={mode !== "play" || !hud.showCue}>
  {hud.cue} <span>{hud.detail}</span>
</div>
<section id="editor" hidden={mode !== "editor"}>
  <header class="editor-head" bind:this={editorHead}>
    <button id="editor-back" onclick={library}>← MY LEVELS</button><label
      >Trail <input
        id="level-title"
        maxlength="40"
        value={draft.name}
        onchange={(e) => {
          draft = {
            ...draft,
            name: e.currentTarget.value.trim() || "My trail",
          };
          saveDraft();
        }}
      /></label
    ><label
      >Length <input
        id="level-length"
        type="number"
        min="20"
        max={MAX_LENGTH}
        value={draft.length}
        onchange={changeLength}
      /></label
    ><button
      id="level-settings"
      onclick={() =>
        sheet(
          "Level settings",
          "Make room above your trail. Background blocks never collide. Pick a licensed electronic track or an original loop.",
          [],
          true,
          "settings",
        )}>HEIGHT / SONG</button
    ><button
      id="test-level"
      class="primary"
      onclick={() => {
        if (!draft.objects.length)
          toast("An empty trail is fine. Add some jumps when you come back.");
        start(0, true);
      }}>▶ TEST</button
    >
  </header>
  <div class="editor-controls" bind:this={editorControls}>
    <div class="palette-row">
      <div class="tabs" role="tablist" aria-label="Objects">
        {#each tabs as name}<button
            role="tab"
            data-tab={name}
            aria-selected={tab === name}
            disabled={layer === "background" && name !== "blocks"}
            onclick={() => chooseTab(name)}>{name.toUpperCase()}</button
          >{/each}
      </div>
      <div id="palette">
        {#each choices[tab] as [type, name]}<button
            aria-pressed={tool === type}
            onclick={() => (tool = type)}>{name}</button
          >{/each}
      </div>
      <button
        id="select-tool"
        aria-pressed={tool === "select"}
        onclick={() => (tool = "select")}>SELECT</button
      ><button id="duplicate-object" disabled={!selection} onclick={duplicate}
        >COPY + PASTE</button
      ><button id="delete-object" disabled={!selection} onclick={deleteSelected}
        >DELETE</button
      ><button
        id="delete-all"
        disabled={!draft.objects.length}
        onclick={deleteAll}>DELETE ALL</button
      >
    </div>
    <div class="transform-row">
      <label
        >Layer <select
          id="layer"
          value={layer}
          onchange={(e) => {
            layer = e.currentTarget.value;
            selected = -1;
            if (layer === "background") chooseTab("blocks");
          }}
          ><option value="play">PLAY</option><option value="background"
            >BACKGROUND</option
          ></select
        ></label
      ><label
        >Step <select id="step-size" bind:value={stepSize}
          ><option value={1}>1 block</option><option value={0.5}>½ block</option
          ><option value={0.05}>¹⁄₂₀ block</option></select
        ></label
      >{#each transforms as [action, label, name]}<button
          data-action={action}
          aria-label={name}
          disabled={!selection}
          onclick={() => adjust(action)}>{label}</button
        >{/each}
    </div>
    <div class="editor-status">
      <label
        >Scroll <input
          id="pan"
          type="range"
          min="0"
          max={draft.length - 8}
          bind:value={pan}
          step="0.5"
        /></label
      ><label id="vertical-scroll" hidden={levelHeight(draft) === 7}
        >Up <input
          id="pan-y"
          aria-label="Vertical scroll"
          type="range"
          min="0"
          max={levelHeight(draft) - 7}
          bind:value={panY}
          step="0.5"
        /></label
      ><output id="selection"
        >{selection
          ? `${selection.type.toUpperCase()} · x ${selection.x.toFixed(2)} / y ${selection.y.toFixed(2)} · ${selection.rotation}°`
          : tool === "select"
            ? "Tap an object to select it."
            : `Tap the grid to place ${tool === "half" ? "a half spike" : "a " + tool}.`}{layer ===
        "background"
          ? " · BACKGROUND: no collision"
          : ""}</output
      ><span id="draft-status"
        >{storageOK
          ? "Saved on this device"
          : "NOT SAVED · storage unavailable"}</span
      >
    </div>
  </div>
</section>
<section id="rotate" hidden={!rotate}>
  <img src="/icon.svg" alt="" width="72" height="72" />
  <h2>Turn sideways to dash</h2>
  <p>More room to see your next jump.</p>
  <button
    id="rotate-menu"
    onclick={() =>
      mode === "editor" || (mode === "play" && custom) ? library() : home()}
    >{mode === "editor" || (mode === "play" && custom)
      ? "MY LEVELS"
      : "MAIN MENU"}</button
  >
</section>
<dialog
  id="sheet"
  aria-labelledby="sheet-title"
  bind:this={dialog}
  oncancel={(e) => {
    if (mode === "play") {
      e.preventDefault();
      if (run.state.status === "playing") resume();
    } else closeSheet();
  }}
>
  <div id="sheet-content">
    {#if panel}<h2 id="sheet-title">{panel.title}</h2>
      {#if panel.text}<p>{panel.text}</p>{/if}
      <div class="buttons">
        {#each panel.actions as [label, handler, primary]}<button
            class:primary
            onclick={handler}>{label}</button
          >{/each}
      </div>
      {#if panel.extra === "transfer"}{#key transfer}<LevelTransfer
            {...transfer}
            add={addSharedLevel}
          />{/key}{/if}
      {#if panel.extra === "settings"}<div class="level-settings">
          <label
            >Height (7–40 blocks)<input
              id="level-height"
              type="number"
              min="7"
              max="40"
              step="1"
              value={levelHeight(draft)}
              onchange={changeHeight}
            /></label
          ><label
            >Song<select
              id="level-song"
              value={draftSong()}
              onchange={(e) => {
                draft = { ...draft, song: Number(e.currentTarget.value) };
                saveDraft();
              }}
              >{#each songs as index}<option value={index}
                  >{trackName(index)}{index === 8 + save.activeLevel
                    ? " · this level’s original"
                    : ""}</option
                >{/each}</select
            ></label
          ><button onclick={toggleSound}
            >{save.sound ? "MUTE PREVIEW" : "LISTEN"}</button
          >
        </div>{/if}
      {#if panel.extra === "about"}<p>
          no ads, no lives, no timers, nothing to buy, no accounts, no cookies,
          nothing sold or shared.
        </p>
        <p class="build-detail">
          v{__APP_VERSION__} · build {__BUILD_ID__} · source {__SOURCE_SHA__}
        </p>
        <button onclick={() => updater?.check()}>CHECK FOR UPDATE</button><a
          href="/licenses.md"
          target="_blank"
          rel="noopener">Licences</a
        >
        <p>
          Music by <a
            href="https://fardifferent.carrd.co/"
            target="_blank"
            rel="noopener">Of Far Different Nature</a
          >, licensed under CC BY 4.0.
        </p>
        <a href="/music/credits.html" target="_blank" rel="noopener"
          >Songs and music credits</a
        >
        <div class="maker">
          <svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="M12 21 3 12C-4 4 6-3 12 5 18-3 28 4 21 12Z" /></svg
          >
          made with love by
          <a href="https://royashbrook.com" target="_blank" rel="noopener"
            >roy</a
          >
          +
          <a
            href="https://royashbrook.com/agents"
            target="_blank"
            rel="noopener">ai</a
          >
          ·
          <a
            href="https://github.com/sponsors/royashbrook"
            target="_blank"
            rel="noopener">sponsor me</a
          >
        </div>{/if}
    {/if}
  </div>
  <button id="sheet-close" hidden={!panel?.closable} onclick={closeSheet}
    >CLOSE</button
  >
  {#if panel}{@render updateButton()}{/if}
</dialog>
{#if !panel}{@render updateButton()}{/if}
