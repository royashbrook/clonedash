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
    SCALABLE,
    TURNABLE,
    PADS,
    RINGS,
    RING_BOUNCE,
    ZONES,
    OUTLINED,
    BLOCKS,
    SLOPES,
    TRIGGERS,
    MAX_COINS,
    MAX_GROUP,
    MAX_TRIGGER_TIME,
    coinCount,
    axes,
    toCentred,
    resized,
  } from "./engine.ts";
  import { LEVELS, COLLECTIONS, COURSE_ORDER, courseSong } from "./levels.ts";
  import { easeFraming } from "./framing.ts";
  import { render } from "./render.ts";
  import { Run } from "./run.ts";
  import { labelOf } from "./types.ts";
  import { Soundtrack, TRACKS, trackName } from "./music.ts";
  import { RECORDINGS } from "./recordings.ts";
  import {
    SAVE,
    readSave,
    storeDraft,
    selectLevel,
    newLevel,
    deleteLevel,
    keepCoins,
    shownCoins,
  } from "./library.ts";
  import { installControl } from "./install.ts";
  import { updateControl, type UpdateCheck } from "./pwa.ts";
  import LevelTransfer from "./LevelTransfer.svelte";
  import SaveMove from "./SaveMove.svelte";
  import { IMPORT, writeBackup, type Backup } from "./backup.ts";
  import { importLevel } from "./transfer.ts";
  import SkinCreator from "./SkinCreator.svelte";
  import LoopMaker from "./LoopMaker.svelte";
  import { LOOPS, addLoop, commitLoops, emptyLoops, loopName, readLoops, validateLoop, type Loop, type LoopStore } from "./loop.ts";
  import {
    SKINS,
    addSkin,
    commitSkins,
    emptyStore,
    readSkins,
    skinArt,
    wornSkin,
    type Skin,
    type SkinStore,
  } from "./skin.ts";
  import { pinchStart, pinchTransform, type Pinch } from "./gesture.ts";
  import { duplicateGroup, inBox, transformGroup } from "./group.ts";
  import { cellsAlong, eraseAlong, paintCell, StrokeHistory, type Step } from "./swipe.ts";
  import type {
    Edges,
    Level,
    ObjectType,
    Piece,
    Point,
    Transform,
  } from "./types.ts";

  type Screen = "home" | "library" | "editor" | "play" | "skins" | "loops";
  type Action = [label: string, handler: () => void, primary?: boolean];
  type Sheet = {
    title: string;
    text: string;
    actions: Action[];
    closable: boolean;
    extra?: "about" | "settings" | "transfer" | "object" | "save";
  };
  const choices = {
    blocks: [
      ["block", "■ SOLID"],
      ["grid", "▦ GRID"],
      ["black", "■ BLACK"],
      ["outline", "□ OUTLINE"],
      ["plain-black", "■ NO BORDER"],
      ["edge-block", "▔ EDGE"],
      ["parallel-block", "═ PARALLEL"],
      ["outer-corner", "┌ OUTER CORNER"],
      ["inner-corner", "⌜ INNER CORNER"],
      ["no-outline-block", "▪ NO OUTLINE"],
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
      ["pogo", "⇈ POGO"],
      ["angle", "◢ ANGLE"],
      ["croissant", "☾ CROISSANT"],
      ["door", "⚿ DOOR"],
    ],
    gravity: [
      ["gravity-up", "↑ UPSIDE DOWN"],
      ["gravity-down", "↓ NORMAL"],
    ],
    speed: [
      ["speed-slow", "< SLOW · 0.8X"],
      ["speed-normal", "> NORMAL · 1X"],
      ["speed-fast", ">> FAST · 1.25X"],
      ["speed-faster", ">>> FASTER · 1.5X"],
    ],
    rings: [
      ["ring", "◉ JUMP RING"],
      ["purple-ring", "◉ PURPLE · 1"],
      ["red-ring", "◉ RED · 5"],
      ["white-ring", "◉ WHITE · CUSTOM"],
      ["gravity-ring", "◉ DARK BLUE · GRAVITY"],
      ["green-ring", "◉ GREEN · GRAVITY + BOUNCE"],
      ["dash-ring", "➤ PINK · DASH"],
      ["gravity-dash-ring", "➤ YELLOW · DASH + GRAVITY"],
      ["black-ring", "◉ BLACK · DROP"],
      ["gray-ring", "◉ GRAY · STOP"],
      ["w-block", "W · WALL PASS"],
      ["r-block", "R · ROOF PASS"],
    ],
    ramp: [
      ["ramp", "◩ SOLID"],
      ["ramp-grid", "◩ GRID"],
      ["ramp-black", "◩ BLACK"],
      ["scoop", "◡ SCOOP"],
      ["scoop-grid", "◡ SCOOP GRID"],
      ["scoop-black", "◡ SCOOP BLACK"],
      ["hill", "◠ HILL"],
      ["hill-grid", "◠ HILL GRID"],
      ["hill-black", "◠ HILL BLACK"],
    ],
    // flat pads that fire when you touch them, no tap: each does what one ring does (#106)
    boosters: [
      ["yellow-pad", "▬ YELLOW · JUMP"],
      ["pink-pad", "▬ PINK · SMALL"],
      ["red-pad", "▬ RED · BIG"],
      ["blue-pad", "▬ BLUE · GRAVITY"],
      ["green-pad", "▬ GREEN · GRAVITY + BOUNCE"],
      ["black-pad", "▬ BLACK · DROP"],
      ["gray-pad", "▬ GRAY · STOP"],
    ],
    coins: [["coin", "● COIN"]],
    // invisible in play; each fires once when you pass it and works on one group id
    triggers: [
      ["move-trigger", "⇄ MOVE"],
      ["color-trigger", "◐ COLOR"],
    ],
  } satisfies Record<string, [string, string][]>;
  // Palette presets stamp fields onto a ring; the stored type stays "ring". The original yellow
  // and the 2.25 block bounce are "no field", so old rings stay byte-identical. The block presets
  // are solid blocks with an outline variant; the Edges control gives any outlined block one.
  const presets: Record<
    string,
    Pick<Piece, "type"> & Partial<Pick<Piece, "color" | "bounce" | "flipsGravity" | "boost" | "dash" | "edges" | "target" | "moveY" | "duration">>
  > = {
    // a new trigger works on group 1 straight away; EDIT OBJECT changes any of it
    "move-trigger": { type: "move-trigger", target: 1, moveY: 2, duration: 1 },
    "color-trigger": { type: "color-trigger", target: 1, color: "#ff5c7a", duration: 1 },
    "purple-ring": { type: "ring", color: "#c77dff", bounce: 1 },
    "red-ring": { type: "ring", color: "#ff5c7a", bounce: 5 },
    "white-ring": { type: "ring", color: "#ffffff" },
    "gravity-ring": { type: "ring", color: "#2b4cff", flipsGravity: true },
    "green-ring": { type: "ring", color: "#9aff6b", flipsGravity: true, boost: true },
    "dash-ring": { type: "ring", color: "#ff8ac4", dash: true },
    "gravity-dash-ring": { type: "ring", dash: true, flipsGravity: true },
    // their own pieces (#106), so an older copy refuses them rather than playing a plain ring
    "black-ring": { type: "drop-ring", color: "#000000" },
    "gray-ring": { type: "stop-ring", color: "#9a9a9a" },
    "edge-block": { type: "block", edges: "edge" },
    "parallel-block": { type: "block", edges: "parallel" },
    "outer-corner": { type: "block", edges: "outer" },
    "inner-corner": { type: "block", edges: "inner" },
    "no-outline-block": { type: "block", edges: "none" },
  };
  const EDGE_NAMES: [Edges | "", string][] = [
    ["", "FULL"],
    ["edge", "EDGE"],
    ["parallel", "PARALLEL"],
    ["outer", "OUTER CORNER"],
    ["inner", "INNER CORNER"],
    ["none", "NO OUTLINE"],
  ];
  const RING_COLORS: [string, string][] = [
    ["#ffd166", "YELLOW"],
    ["#c77dff", "PURPLE"],
    ["#ff5c7a", "RED"],
    ["#ffffff", "WHITE"],
    ["#9aff6b", "GREEN"],
    ["#53e3ff", "BLUE"],
    ["#ff8ac4", "PINK"],
    ["#ffb477", "ORANGE"],
    ["#2b4cff", "DARK BLUE"],
    ["#000000", "BLACK"],
    ["#9a9a9a", "GRAY"],
  ];
  const article = (name: string) => (/^[aeiou]/.test(name) ? "an " : "a ") + name;
  // what a selected trigger will do, for the editor's status line
  const triggerText = (o: Piece) =>
    !TRIGGERS.includes(o.type)
      ? ""
      : ` · GROUP ${o.target ?? "NONE"}` +
        (o.type === "move-trigger"
          ? ` · MOVE ${o.moveX ?? 0}, ${o.moveY ?? 0}`
          : ` · ${RING_COLORS.find(([hex]) => hex === (o.color ?? RING_COLORS[0][0]))?.[1] ?? o.color}`) +
        ` · ${o.duration ? `${o.duration}S` : "INSTANT"}` +
        (o.touch ? (o.multi ? " · TOUCH · MULTI" : " · TOUCH") : "");
  const typeOf = (t: string): ObjectType =>
    presets[t]?.type ?? (t as ObjectType);
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
    custom = $state(false),
    // a skin is open in its editor: the bottom bar steps aside (its tabs would leave
    // without the editor's own ask before dropping changes)
    drafting = $state(false),
    loopMaker = $state<ReturnType<typeof LoopMaker>>();
  // The selection is a group (#87); its last piece is the one the controls show and a pinch
  // turns. Plain taps keep it to one piece; the MULTI tool adds to it and sweeps a box.
  let group = $state<number[]>([]),
    sweep = $state<{ from: Point; to: Point } | null>(null),
    tool = $state<string>("block"),
    tab = $state<Tab>("blocks");
  let layer = $state("play"),
    stepSize = $state(1),
    snap = $state(true), // pinch snaps to 15 degrees and quarter sizes
    pan = $state(0),
    panY = $state(0);
  // Two fingers on the editor canvas size and turn the selected piece (photo-crop style).
  const fingers = new Map<number, Point>();
  let pinch: Pinch | null = null;
  // SWIPE (#106, docs/ramps-and-boosters.md rule 6): off at first, and off the editor is as it
  // was. On, one finger paints the chosen piece, or with ERASE removes pieces, along its path
  // (src/swipe.ts). A stroke is saved once, when it ends, as one step of a strokes-only history.
  let swipe = $state(false),
    canUndo = $state(false),
    canRedo = $state(false);
  let stroke: {
    id: number;
    last: Point;
    before: Piece[];
    group: number[];
    placed: number;
    changed: boolean;
    stopped: boolean;
    said: Set<string>;
    visited: Set<string>;
  } | null = null;
  const strokes = new StrokeHistory();
  let portrait = $state(false),
    paused = false,
    testing = $state(false), // a run over the editor grid, palette still up (TRY)
    run = new Run(LEVELS[0]);
  let hud = $state({
    label: "",
    progress: 0,
    attempt: 1,
    cue: "",
    detail: "",
    showCue: false,
    coins: "", // "2 / 5" on a level with coins, else empty and hidden
  });
  let notice = $state(""),
    panel = $state.raw<Sheet | null>(null),
    installVisible = $state(false),
    updateReady = $state(false),
    updating = $state(false),
    checking = $state(false),
    pull = $state(0),
    pulled = $state(false);
  let transfer = $state.raw<{ level?: Level; skin?: Skin; loop?: Loop; initial?: string }>({});
  let loops = $state.raw<LoopStore>(emptyLoops()),
    loopsBroken = $state(false);
  let moving = $state.raw<{ initial?: string }>({});
  // skins live under their own key (docs/skins.md): a level write never touches them
  let skins = $state.raw<SkinStore>(emptyStore()),
    skinsBroken = $state(false);
  const worn = $derived(wornSkin(skins));
  const wornArt = $derived(worn ? skinArt(worn) : null);
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
  // a phone held upright plays (#138); only the level editor asks to turn it
  const rotate = $derived(portrait && mode === "editor");
  // upright play: the view looks further ahead, at a zoom the player picks while paused
  const LEAD = 1.5,
    ZOOM_MIN = 0.7,
    ZOOM_MAX = 1.5;
  let zoom = $state(1);
  const upright = () => portrait && mode === "play";
  // what the camera shows: the upright lead and zoom, eased only across a turn (#138, rule 6)
  let framing = { lead: 0, zoom: 1 },
    turning = false;
  function frameCamera(dt: number) {
    // the lead never puts the cube closer than a block to the left edge, so at the start it grows
    // from nothing as the run gets going and the cube is on screen from the first frame
    const lead = Math.min(LEAD, Math.max(0, run.state.x - run.camera - 1)),
      to = upright() ? { lead, zoom } : { lead: 0, zoom: 1 };
    framing = turning && !reduced ? easeFraming(framing, to, dt) : to;
    if (framing.lead === to.lead && framing.zoom === to.zoom) turning = false;
    const shown = `${framing.lead.toFixed(2)} ${framing.zoom.toFixed(2)}`;
    if (canvas.dataset.framing !== shown) canvas.dataset.framing = shown;
  }
  function zoomBy(step: number) {
    zoom = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + step)) * 10) / 10;
  }
  const selected = $derived(group.at(-1) ?? -1);
  const selection = $derived(draft.objects[selected]);
  const select = (index: number) => (group = index >= 0 ? [index] : []);
  const draftSong = () => draft.song ?? 8 + save.activeLevel;
  // what the level being edited or played plays: its own loop (#121), or its song
  const draftMusic = () => draft.loop ?? draftSong();
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
  // The import marker this tab loaded with (#124, src/backup.ts IMPORT). If it has changed, another
  // tab loaded a whole save since this one read its stores, so this tab reloads instead of writing
  // its old save over the new one. Checked before every write, not only on storage events, which
  // can arrive after this tab's next write.
  let importSeen: string | null = null;
  // a load that did not finish leaves the stores mixed; until the player loads again or keeps what
  // is here, ordinary saving stays off so it cannot make that harder to undo
  let importCutOff = $state(false);
  function stale() {
    let now: string | null;
    try {
      now = localStorage.getItem(IMPORT);
    } catch {
      return false; // no storage, nothing to protect
    }
    if (now === importSeen) return false;
    location.reload();
    return true;
  }
  function guard() {
    if (importCutOff) throw Error("Finish loading your save first: ABOUT → MOVE YOUR SAVE.");
    if (stale()) throw Error("A save was loaded in another tab. Reloading…");
  }
  function persist() {
    if (storageOK && importCutOff) {
      if (!panel) cutOffSheet(); // a change that can't be saved brings the choice back
      return;
    }
    if (storageOK && stale()) return;
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
    endStroke();
    mode = next;
    testing = false;
    document.body.dataset.mode = next;
    run.interrupt();
    orientation();
  }
  // The trail runs over the editor grid with the palette still up. Stop drops back to editing
  // at the spot the run was looking at. A saved edit restarts the run from the top.
  const live = () => mode === "play" || (mode === "editor" && testing);
  function tryLevel() {
    if (testing) {
      testing = false;
      run.interrupt();
      pan = Math.max(0, Math.min(draft.length - 8, Math.round(run.camera * 2) / 2));
      panY = Math.max(0, Math.min(levelHeight(draft) - 7, Math.round(run.cameraY * 2) / 2));
      return;
    }
    music.unlock(save.sound);
    run = new Run(draft);
    select(-1);
    testing = true;
    snapshot();
    tone(523, 0.1);
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
    endStroke(); // a sheet ends a stroke (rule 6d)
    const next = { title, text, actions, closable, extra };
    panel = next;
    await tick();
    if (alive && panel === next && !dialog.open) dialog.showModal();
  }
  function record() {
    const s = run.state;
    // coins count only for a finished run; the best is the most in one, on built-ins and my levels
    if (keepCoins(save, s, run.level, custom, current)) persist();
    if (custom) return;
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
    if (!["level", "skin", "save", "loop"].some((k) => params.has(k))) return;
    const initial = location.href;
    history.replaceState(null, "", location.pathname + location.search);
    // a save link only previews too (#124); with anything else beside it, the save sheet refuses
    // it as ambiguous before reading either
    if (params.has("save")) moveSave(initial);
    // a loop link opens its preview on the LOOPS screen (#121); ADD is a separate tap
    else if (params.has("loop")) loopSheet({ initial });
    // a skin link only opens the preview; it is never added or worn without a tap
    else if (params.has("skin") && !params.has("level")) skinSheet({ initial });
    else sharing(undefined, initial);
  }
  // Moving a whole save (#124, src/backup.ts). The sheet reads the stores itself, so it shows what
  // is saved, and a replace reloads the page so nothing here keeps the old save in memory.
  function moveSave(initial = "") {
    closeSheet();
    paused = false;
    if (mode === "play") home();
    moving = { initial };
    void sheet("Move your save", "", [], true, "save");
  }
  function cutOffSheet() {
    void sheet(
      "Loading a save didn't finish",
      "Some of your progress, levels or skins may be from the save you were loading. Nothing new is saved until you load it again or keep what's here now.",
      [
        ["LOAD IT AGAIN", () => moveSave(), true],
        [
          "KEEP WHAT'S HERE",
          () => {
            // another tab may have finished a newer load meanwhile: then this tab reloads into it
            // rather than erase that load's marker and resume what it read at boot
            if (stale()) return;
            // the player chose: clearing the marker tells every tab, and saving turns back on
            localStorage.removeItem(IMPORT);
            importSeen = null;
            importCutOff = false;
            closeSheet();
          },
        ],
      ],
      false,
    );
  }
  // loops ride along only when this device has a loop key, so a device that never made one sends
  // the same save 1.0.85 did (docs/loops.md)
  const storedSave = (): Backup => {
    const raw = localStorage.getItem(LOOPS);
    return {
      game: readSave(localStorage.getItem(SAVE), LEVELS.length),
      skins: readSkins(localStorage.getItem(SKINS)),
      ...(raw === null ? {} : { loops: readLoops(raw) }),
    };
  };
  // storageOK is also false when only the old save is unreadable, and replacing that is the point,
  // so the writer's own errors decide: it reads both stores back before it reports success
  function replaceSave(backup: Backup) {
    writeBackup(localStorage, backup, LEVELS.length);
    location.reload();
  }
  function openSkins() {
    closeSheet();
    paused = false;
    setMode("skins");
  }
  function skinSheet(next: { skin?: Skin; initial?: string }) {
    openSkins();
    transfer = next;
    void sheet(next.skin ? "Share skin" : "Import", "", [], true, "transfer");
  }
  // every skin write re-reads the skins key (skin.ts commitSkins, stale-tab preservation); a
  // refused write throws and leaves the last confirmed skins showing
  function commitSkin(change: (latest: SkinStore) => void) {
    guard(); // a change made against this tab's skins must not land on a loaded save's skins
    skins = commitSkins(localStorage, change);
    skinsBroken = false;
    return skins;
  }
  function addSharedSkin(skin: Skin) {
    commitSkin((s) => void addSkin(s, skin));
    openSkins();
    toast("Skin added. Find it in My skins.");
  }
  // the bottom bar: a tab per menu screen, and MORE for the rest
  const DOCK = [
    ["home", "dock-play", "PLAY", "M8 5 19 12 8 19Z"],
    ["library", "my-levels", "BUILD", "M3 14h6v6H3Z M9 14h6v6H9Z M15 14h6v6h-6Z M9 8h6v6H9Z"],
    ["skins", "skins-open", "LOOKS", "M5 5h14v14H5Z M9 10h.01 M15 10h.01 M9 15h6"],
    ["loops", "loops-open", "MUSIC", "M9 18V6l10-2v12 M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0 M19 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0"],
  ] as const;
  function goTab(tab: (typeof DOCK)[number][0]) {
    const go = () => {
      if (tab === "home") home();
      else if (tab === "library") library();
      else if (tab === "skins") openSkins();
      else if (mode === "loops") loopMaker?.close();
      else openLoops();
    };
    // a loop open in the editor keeps the bar (#140); leaving it asks first when it has changes
    if (mode === "loops" && loopMaker) loopMaker.guard(go);
    else go();
  }
  function about() {
    sheet(
      "Cube Dash",
      `${LEVELS.length} one-button trails, from warmups to hard, and a place to build your own. An original geometric platformer inspired by Geometry Dash, made from a kid’s game idea.`,
      [],
      true,
      "about",
    );
  }
  function more() {
    if (mode === "loops") loopMaker?.silence(); // a sheet opens over silence, as the loop list's own do
    sheet("More", "", [
      ["HOW TO PLAY", how],
      ...(installVisible ? [["INSTALL", () => installer?.prompt()] as Action] : []),
      ["ABOUT, UPDATES AND YOUR SAVE", about],
    ]);
  }
  // the LOOPS screen (#121, docs/loops.md); its writes follow the skin store's rules
  function openLoops() {
    closeSheet();
    paused = false;
    setMode("loops");
  }
  function loopSheet(next: { loop?: Loop; initial?: string }) {
    openLoops();
    transfer = next;
    void sheet(next.loop ? "Share loop" : "Import", "", [], true, "transfer");
  }
  function commitLoop(change: (latest: LoopStore) => void) {
    guard();
    loops = commitLoops(localStorage, change);
    loopsBroken = false;
    return loops;
  }
  function addSharedLoop(loop: Loop) {
    commitLoop((s) => void addLoop(s, loop));
    openLoops();
    toast("Loop added. Find it in My loops.");
  }
  function askSkin(title: string, text: string, yes: string, run: () => void) {
    void sheet(
      title,
      text,
      [
        ["KEEP IT", closeSheet, true],
        [
          yes,
          () => {
            closeSheet();
            run();
          },
        ],
      ],
      false,
    );
  }
  function addSharedLevel(level: Level) {
    if (!storageOK)
      throw Error(
        "Storage is unavailable. Enable it before importing a level.",
      );
    guard();
    save = importLevel(localStorage, save, level, LEVELS.length);
    draft = structuredClone(save.draft);
    forget();
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
      guard();
      const source = run.level; // as authored, not where this run's triggers moved things
      // Import uses a fresh storage read, a new ID, and verified writes. Only then
      // select the copy; the previous draft remains in its original library slot.
      save = importLevel(
        localStorage,
        save,
        {
          ...source,
          name: `${source.name.slice(0, 33)} (copy)`,
          // one song source: a level with its own loop keeps it and gets no song beside it
          ...(custom && source.loop ? {} : { song: custom ? draftSong() : courseSong(current) }),
        },
        LEVELS.length,
        true,
      );
      draft = structuredClone(save.draft);
      forget();
      select(-1);
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
        // upright only, and only here: the run is stopped behind this sheet, so a tap is never a jump
        ...(portrait
          ? ([
              ["ZOOM OUT (SEE FURTHER)", () => zoomBy(-0.1)],
              ["ZOOM IN (SEE BIGGER)", () => zoomBy(0.1)],
            ] as Action[])
          : []),
      ],
      false,
    );
  }
  // the shape is read fresh (rule 1); a turn mid-run pauses it where it is (rule 3) and a turn under
  // the pause sheet rebuilds it so the zoom buttons follow the shape (rule 4)
  function orientation() {
    const next = innerHeight > innerWidth,
      turned = next !== portrait;
    portrait = next;
    if (turned) {
      turning = true;
      letGo();
    }
    if (mode !== "play" || run.state.status === "complete") return;
    if (turned && !paused) pause();
    else if (paused && (!panel || (turned && panel.title === "Paused"))) pause();
  }
  function interrupt() {
    endStroke(); // the window lost focus or the page went away: the stroke ends (rule 6d)
    pause();
    run.interrupt();
    music.interrupt();
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
    const fx = run.state.fx,
      coins = fx?.coinTotal ? ` Coins: ${fx.coins} / ${fx.coinTotal}.` : "";
    void sheet(
      "Level Complete!",
      (custom
        ? "Your trail works. Keep building!"
        : `${run.state.level.name} cleared. Nice flow.`) + coins,
      actions,
      false,
    );
  }
  function press() {
    if (!live() || paused || rotate || panel) return;
    run.press();
    tone(440, 0.045, 0.018);
    snapshot();
  }
  function capture(id: number) {
    try {
      canvas.setPointerCapture(id);
    } catch {
      /* a synthetic pointer has no capture; real fingers do */
    }
  }
  function pointerdown(e: PointerEvent) {
    if (mode === "editor" && !testing) {
      fingers.set(e.pointerId, [e.clientX, e.clientY]);
      capture(e.pointerId);
      if (stroke) endStroke(false); // a second finger ends the stroke before a pinch (rule 6d)
      if (fingers.size === 1) {
        if (painting()) startStroke(e);
        else editAt(e);
      } else if (fingers.size === 2 && selected >= 0 && !rotate && !panel) {
        sweep = null;
        const [a, b] = [...fingers.values()],
          piece = draft.objects[selected];
        pinch = pinchStart(a, b, axes(piece), piece.rotation);
      }
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
      if (live()) {
        e.preventDefault();
        if (!e.repeat) press();
      }
    }
    if (e.code === "Escape" && mode === "play" && !panel) pause();
    if (e.code === "Escape" && mode === "editor" && testing && !panel) tryLevel();
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
      label: `${s.level.name} · ${labelOf(s.mode)} ${s.gravity > 0 ? "↑" : "↓"}`,
      progress: Math.min(100, ((s.x - 1) / (s.level.length - 1)) * 100),
      attempt: run.attempt,
      cue:
        s.mode === "plane"
          ? "HOLD TO FLY"
          : s.mode === "angle"
            ? "HOLD TO CLIMB"
            : s.mode === "wheel"
              ? "TAP TO FLIP GRAVITY"
              : s.mode === "croissant"
                ? "TAP TO TELEPORT"
              : "TAP TO JUMP",
      detail:
        s.mode === "plane"
          ? "RELEASE TO FALL"
          : s.mode === "angle"
            ? "RELEASE TO DIVE"
            : s.mode === "wheel" || s.mode === "croissant"
              ? "LAND FIRST · THEN TAP"
              : s.mode === "pogo"
                ? "TAP AGAIN IN MIDAIR"
                : s.mode === "door" ? "HOLD TO JUMP HIGHER" : "HOLD TO KEEP JUMPING",
      showCue:
        !paused &&
        !rotate &&
        !run.learned &&
        s.time <= run.cueUntil &&
        s.status === "playing",
      coins: s.fx?.coinTotal ? `${s.fx.coins} / ${s.fx.coinTotal}` : "",
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
      mode === "editor" && !testing
        ? draft
        : live()
          ? run.state.level
          : LEVELS[0];
    return render(canvas, {
      level,
      state: live() ? run.state : mode === "home" ? attract : null,
      skin: wornArt,
      camera: live() ? run.camera + framing.lead : mode === "editor" ? pan : 0,
      zoom: framing.zoom,
      cameraY: live() ? run.cameraY : mode === "editor" ? panY : 0,
      editing: mode === "editor",
      layer,
      group,
      box: sweep && {
        left: Math.min(sweep.from[0], sweep.to[0]),
        right: Math.max(sweep.from[0], sweep.to[0]),
        bottom: Math.min(sweep.from[1], sweep.to[1]),
        top: Math.max(sweep.from[1], sweep.to[1]),
      },
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
    if (innerHeight > innerWidth !== portrait) orientation(); // a resize that never came (rule 1)
    frameCamera(dt);
    if (live() && !paused && !rotate && !document.hidden) {
      const event = run.advance(dt);
      if (event.died) {
        if (mode === "play") record();
        tone(90, 0.16);
      }
      if (event.restarted && mode === "play") music.stop();
      if (event.complete) {
        if (mode === "play") complete();
        else {
          tryLevel();
          toast("Your trail works. Keep building!");
        }
      }
    }
    music.sync(
      mode === "editor" || (mode === "play" && custom)
        ? draftMusic()
        : mode === "play"
          ? courseSong(current)
          : 109,
      !document.hidden &&
        (mode === "home" ||
          mode === "library" ||
          mode === "skins" ||
          (mode === "editor" && !rotate) ||
          (mode === "play" &&
            !paused &&
            !rotate &&
            // a completed trail keeps its song going through the complete screen
            ((run.state.status === "playing" && run.readyTime <= 0) ||
              run.state.status === "complete"))),
      mode === "play" ? run.state.time : now / 1000,
    );
    draw();
    if (live()) snapshot();
    raf = requestAnimationFrame(frame);
  }
  // Every edit saves through here. Any edit but a stroke, an undo or a redo clears the strokes
  // history, so an older stroke can never undo it (rule 6e).
  function saveDraft(stroked = false) {
    if (!stroked) strokes.clear();
    canUndo = strokes.done.length > 0;
    canRedo = strokes.undone.length > 0;
    try {
      storeDraft(save, draft);
      persist();
    } catch {
      toast(
        "Keep objects inside the trail, after the start and before the finish.",
      );
    }
    draft = { ...draft, objects: [...draft.objects] };
    if (testing) run = new Run(draft); // an edit mid-run starts the run over on the new trail
  }
  // another level in the editor: the strokes history was for the old one
  function forget() {
    endStroke();
    strokes.clear();
    canUndo = canRedo = false;
  }
  const painting = () => swipe && tool !== "select" && tool !== "multi";
  function toggleSwipe() {
    endStroke();
    swipe = !swipe;
    if (!swipe && tool === "erase") tool = choices[tab][0][0];
  }
  // a stroke says each thing it has to say once
  function say(text: string) {
    if (stroke && !stroke.said.has(text)) {
      stroke.said.add(text);
      toast(text);
    }
  }
  function startStroke(e: PointerEvent) {
    if (rotate || panel) return;
    const view = draw(),
      at: Point = [view.x(e.clientX), view.y(e.clientY)];
    stroke = {
      id: e.pointerId,
      last: at,
      before: structuredClone(draft.objects),
      group: [...group], // the selection as it was, for undo, before an erase clears it
      placed: -1,
      changed: false,
      stopped: false,
      said: new Set(),
      visited: new Set(),
    };
    if (tool === "erase") group = []; // indices move as pieces go
    strokeTo(at);
  }
  // the stretch of the stroke from its last sample to this one, every cell on the way (rule 6b)
  function strokeTo(at: Point) {
    const st = stroke!,
      from = st.last,
      activeLayer = layer === "background" ? "background" : undefined;
    st.last = at;
    if (tool === "erase") {
      if (eraseAlong(draft, from, at, activeLayer)) st.changed = true;
      return;
    }
    for (const [ox, oy] of cellsAlong(from, at, stepSize)) {
      if (st.stopped) return;
      const key = `${ox},${oy}`;
      if (oy < 0 || oy >= levelHeight(draft) || st.visited.has(key)) continue;
      st.visited.add(key);
      const piece: Piece = { ...object(typeOf(tool), ox, oy), ...presets[tool] };
      if (activeLayer) piece.layer = activeLayer;
      const done = paintCell(draft, piece);
      if (done === "placed") {
        st.changed = true;
        st.placed = draft.objects.length - 1;
      } else if (done === "outside") say("Leave three blocks at the start and two at the finish.");
      else if (done === "invalid")
        say("That piece extends above the ceiling. Increase the height or place it lower.");
      else if (done === "full" || done === "coins") {
        // a cap: stop placing, keep what was placed (rule 6c)
        st.stopped = true;
        say(
          done === "full"
            ? "This trail has reached 600 objects."
            : `This trail already has ${MAX_COINS} coins. That is the most a level can hold.`,
        );
      }
    }
  }
  function endStroke(drop = true) {
    const st = stroke;
    if (!st) return;
    stroke = null;
    // ended by something other than its finger (blur, a hidden page, a sheet, leaving the editor):
    // the finger stops counting, so a lift that never reaches the canvas leaves nothing behind
    if (drop) {
      fingers.delete(st.id);
      try {
        canvas.releasePointerCapture(st.id);
      } catch {
        /* already gone */
      }
    }
    if (!st.changed) {
      group = st.group; // nothing changed: nothing saved, no history step, the selection as it was
      return;
    }
    try {
      validateLevel(draft);
    } catch {
      // every cell was checked as it went, so this only guards: never save an invalid level
      draft = { ...draft, objects: st.before };
      return;
    }
    group = tool === "erase" || st.placed < 0 ? [] : [st.placed];
    strokes.push({
      before: st.before,
      after: structuredClone(draft.objects),
      groupBefore: st.group,
      groupAfter: [...group],
    });
    saveDraft(true);
  }
  // a turn ends every editor gesture where it stands (docs/portrait.md rule 3): a stroke keeps what
  // it painted before the turn, a pinch keeps and saves its last good shape, a box sweep is dropped,
  // and no finger from before the turn counts again until it comes down fresh
  function letGo() {
    endStroke();
    if (pinch) {
      pinch = null;
      saveDraft();
    }
    sweep = null;
    for (const id of fingers.keys())
      try {
        canvas.releasePointerCapture(id);
      } catch {
        /* already gone */
      }
    fingers.clear();
  }
  function stepTo(step: Step | null, side: "before" | "after") {
    if (step) {
      const next = { ...draft, objects: structuredClone(step[side]) };
      try {
        validateLevel(next);
        draft = next;
        group = [...(side === "before" ? step.groupBefore : step.groupAfter)];
      } catch {
        strokes.clear();
      }
    } else if (!strokes.done.length && !strokes.undone.length)
      toast("Something else changed since that swipe, so it cannot be undone.");
    saveDraft(true);
  }
  function undo() {
    endStroke();
    stepTo(strokes.undo(draft.objects), "before");
  }
  function redo() {
    endStroke();
    stepTo(strokes.redo(draft.objects), "after");
  }
  function openEditor() {
    closeSheet();
    paused = false;
    setMode("editor");
  }
  function loadCustom(id: number) {
    draft = selectLevel(save, id);
    forget();
    select(-1);
    pan = 0;
    panY = 0;
    persist();
  }
  function createLevel() {
    try {
      draft = newLevel(save);
      forget();
      select(-1);
      pan = 0;
      panY = 0;
      persist();
      openEditor();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Cannot create level.");
    }
  }
  function deleteCustom(id: number, name: string) {
    void sheet(
      "Delete this level?",
      `Remove "${name}" from My Levels? This cannot be undone. Your completed trails will stay.`,
      [
        ["CANCEL", closeSheet, true],
        [
          "DELETE LEVEL",
          () => {
            draft = deleteLevel(save, id);
            forget();
            select(-1);
            pan = 0;
            panY = 0;
            persist();
            closeSheet();
            toast(`"${name}" deleted.`);
          },
        ],
      ],
      false,
    );
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
  function pieceAt(x: number, y: number, activeLayer?: string) {
    return draft.objects.findLastIndex((o) => {
      const b = bounds(o);
      return (
        o.layer === activeLayer &&
        x >= b.left - 0.2 &&
        x <= b.right + 0.2 &&
        y >= b.bottom - 0.2 &&
        y <= b.top + 0.2
      );
    });
  }
  // MULTI: a tap adds a piece to the group (or takes it back out), a tap on nothing clears it,
  // and a swipe adds everything its box touches.
  function endSweep() {
    if (!sweep) return;
    const { from, to } = sweep,
      activeLayer = layer === "background" ? "background" : undefined;
    sweep = null;
    if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 0.3) {
      const hit = pieceAt(from[0], from[1], activeLayer);
      group =
        hit < 0
          ? []
          : group.includes(hit)
            ? group.filter((i) => i !== hit)
            : [...group, hit];
      return;
    }
    const box = {
      left: Math.min(from[0], to[0]),
      right: Math.max(from[0], to[0]),
      bottom: Math.min(from[1], to[1]),
      top: Math.max(from[1], to[1]),
    };
    group = [
      ...group,
      ...inBox(draft, box, activeLayer).filter((i) => !group.includes(i)),
    ];
  }
  function editAt(e: PointerEvent) {
    if (rotate || panel) return;
    const view = draw(),
      x = view.x(e.clientX),
      y = view.y(e.clientY);
    if (y < 0 || y >= levelHeight(draft)) return;
    const activeLayer = layer === "background" ? "background" : undefined;
    if (tool === "select") {
      select(pieceAt(x, y, activeLayer));
      return;
    }
    if (tool === "multi") {
      sweep = { from: [x, y], to: [x, y] };
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
    if (typeOf(tool) === "coin" && coinCount(draft) >= MAX_COINS) {
      toast(`This trail already has ${MAX_COINS} coins. That is the most a level can hold.`);
      return;
    }
    // A zone or a trigger lies over whatever is in its cell, so it only collides with another
    // zone or trigger there.
    const over = (type: string) => ZONES.includes(type) || TRIGGERS.includes(type),
      zone = over(typeOf(tool)),
      existing = draft.objects.findIndex(
        (o) =>
          o.layer === activeLayer &&
          o.x === ox &&
          o.y === oy &&
          over(o.type) === zone,
      );
    if (existing >= 0) {
      select(existing);
      return;
    }
    const piece = {
      ...object(typeOf(tool), Math.round(ox * 20) / 20, Math.round(oy * 20) / 20),
      ...presets[tool],
    };
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
    select(draft.objects.length - 1);
    saveDraft();
  }
  function changed(change: (o: Piece) => void, fits = (o: Piece) => true) {
    return {
      ...draft,
      objects: draft.objects.map((o, i) => {
        if (!group.includes(i) || !fits(o)) return o;
        const piece = structuredClone(o);
        change(piece);
        return piece;
      }),
    };
  }
  function adjust(action: Transform) {
    if (selected < 0) return;
    // one piece turns in its own place; a group turns as one shape
    const moved =
      group.length > 1
        ? transformGroup(group.map((i) => draft.objects[i]), action, stepSize)
        : [
            // one piece turns or flips about its middle (#117); a move keeps its own anchor
            transform(
              ["left", "right", "up", "down"].includes(action)
                ? structuredClone(selection)
                : toCentred(structuredClone(selection)),
              action,
              stepSize,
            ),
          ];
    const next = {
      ...draft,
      objects: draft.objects.map((o, i) =>
        group.includes(i) ? moved[group.indexOf(i)] : o,
      ),
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
  // The WIDTH and HEIGHT sliders (#117): each changes its own axis. A single-scale piece is
  // converted (resized) only when its value really changes, and 1 by 1 is stored as no field.
  function setAxis(axis: 0 | 1, value: number) {
    if (selected < 0) return;
    const k = Math.round(value * 20) / 20;
    const next = {
      ...draft,
      objects: draft.objects.map((o, i) => {
        if (!group.includes(i) || !SCALABLE.includes(o.type)) return o;
        const now = axes(o);
        if (now[axis] === k) return o;
        now[axis] = k;
        return resized(o, now[0], now[1]);
      }),
    };
    try {
      validateLevel(next);
    } catch {
      toast("Too big for that spot. Move it down or lower the ceiling first.");
      return;
    }
    draft = next;
    saveDraft();
  }
  // The Angle slider: any whole degree for blocks, spikes and ramps. The quarter-turn buttons
  // keep working on top of it (they add 90 to whatever angle is set).
  function setAngle(value: number) {
    if (selected < 0) return;
    const rotation = ((Math.round(value) % 360) + 360) % 360;
    // a single-scale piece turns about its middle too: converted first, only if the angle changes
    const next = {
      ...draft,
      objects: draft.objects.map((o, i) =>
        !group.includes(i) || !(TURNABLE.includes(o.type) || o.dash) || o.rotation === rotation
          ? o
          : { ...toCentred(structuredClone(o)), rotation },
      ),
    };
    try {
      validateLevel(next);
    } catch {
      toast("That angle pokes through the ceiling. Move it down first.");
      return;
    }
    draft = next;
    saveDraft();
  }
  // The ring controls: colour and bounce height. The defaults are stored as "no field".
  function setRing(change: Pick<Piece, "color" | "bounce">) {
    if (selected < 0) return;
    const next = changed((piece) => {
      if (change.color !== undefined) {
        if (change.color === RING_COLORS[0][0]) delete piece.color;
        else piece.color = change.color;
      }
      if (change.bounce !== undefined) {
        if (change.bounce === RING_BOUNCE) delete piece.bounce;
        else piece.bounce = change.bounce;
      }
    }, (o) => RINGS.includes(o.type) && (change.bounce === undefined || (o.type === "ring" && !(o.flipsGravity || o.dash))));
    validateLevel(next);
    draft = next;
    saveDraft();
  }
  // EDIT OBJECT (#90): switches on the selected piece, or every piece in the group that can take
  // one. Off is stored as "no field". The sheet reopens after each switch to show where it stands.
  const OPTIONS: [
    "noTouch" | "hidden" | "wallPass" | "roofPass" | "multi",
    string,
    string,
    (o: Piece) => boolean,
  ][] = [
    ["noTouch", "NO TOUCH", "you see it but go right through it", (o) => !ZONES.includes(o.type) && !TRIGGERS.includes(o.type) && o.type !== "coin"],
    ["hidden", "HIDDEN", "it is invisible in play but still there", (o) => !ZONES.includes(o.type) && !TRIGGERS.includes(o.type)],
    ["wallPass", "WALL PASS", "its sides stop you instead of killing you", (o) => BLOCKS.includes(o.type) || SLOPES.includes(o.type)],
    ["roofPass", "ROOF PASS", "you bump your head on it instead of dying", (o) => BLOCKS.includes(o.type)],
    ["multi", "MULTI TOUCH", "it works again every time you come back to it, not just once", (o) => RINGS.includes(o.type)],
  ];
  function editObject() {
    if (selected < 0) return;
    const fits = OPTIONS.filter(([, , , fits]) => group.some((i) => fits(draft.objects[i])));
    const trigger = TRIGGERS.includes(selection.type);
    void sheet(
      "Edit object",
      trigger
        ? "A trigger fires once when you run past it, or with TOUCH, when you touch it. MULTI makes a touch trigger fire every time you touch it again. It works on every piece with its group id."
        : (fits.length
            ? (group.length > 1 ? `${group.length} pieces. ` : "") +
              fits.map(([key, name, text]) => `${name} ${selection[key] ? "ON" : "OFF"}: ${text}.`).join(" ") +
              " "
            : "") + "GROUP ID: give it a number so a trigger can move it or colour it.",
      [
        ...fits.map(([key, name, , fit]): Action => [
          `${name}: ${selection[key] ? "TURN OFF" : "TURN ON"}`,
          () => {
            const on = !selection[key];
            const next = changed((piece) => {
              if (on) piece[key] = true;
              else delete piece[key];
            }, fit);
            validateLevel(next);
            draft = next;
            saveDraft();
            editObject();
          },
        ]),
        ["DONE", closeSheet, true],
      ],
      true,
      "object",
    );
  }
  // GROUP ID (EDIT OBJECT): a whole number 1 to 99 on the selected pieces, blank or 0 for none.
  // Triggers carry no group. Ids belong to this level only; copies keep theirs.
  function setGroup(input: HTMLInputElement) {
    const n = input.value.trim() === "" ? 0 : Number(input.value);
    if (!Number.isInteger(n) || n < 0 || n > MAX_GROUP) {
      input.value = String(selection?.group ?? "");
      toast(`A group id is a whole number from 1 to ${MAX_GROUP}. Leave it blank for none.`);
      return;
    }
    const next = changed((piece) => {
      if (n) piece.group = n;
      else delete piece.group;
    }, (o) => !TRIGGERS.includes(o.type));
    validateLevel(next);
    draft = next;
    saveDraft();
  }
  // The trigger fields (EDIT OBJECT on a trigger). Zero moves and an instant time are stored as
  // "no field", like the other defaults.
  function setTrigger(
    key: "target" | "moveX" | "moveY" | "duration" | "color",
    input: HTMLInputElement | HTMLSelectElement,
  ) {
    const value = input.value.trim(),
      n = key === "duration" ? Math.round(Number(value || 0) * 100) / 100 : Number(value || 0);
    const kind =
      key === "moveX" || key === "moveY" ? "move-trigger" : key === "color" ? "color-trigger" : "";
    const next = changed((piece) => {
      if (key === "color") piece.color = value;
      else if (n) piece[key] = n;
      else delete piece[key];
    }, (o) => (kind ? o.type === kind : TRIGGERS.includes(o.type)));
    try {
      if (key !== "color" && !Number.isFinite(n)) throw Error("not a number");
      validateLevel(next);
    } catch {
      input.value = String(selection?.[key] ?? "");
      toast(
        key === "target"
          ? `Pick a group id from 1 to ${MAX_GROUP}.`
          : key === "duration"
            ? `Time is 0 (instant) to ${MAX_TRIGGER_TIME} seconds.`
            : "Moves are whole blocks, and no further than the level is long or tall.",
      );
      return;
    }
    draft = next;
    saveDraft();
  }
  // TOUCH and MULTI on the selected triggers (#117). Off is no field; turning TOUCH off clears MULTI,
  // which only means something on a touch trigger.
  function setTouch(key: "touch" | "multi", on: boolean) {
    const next = changed((piece) => {
      if (on) piece[key] = true;
      else delete piece[key];
      if (!piece.touch) delete piece.multi;
    }, (o) => TRIGGERS.includes(o.type) && (key === "touch" || !!o.touch));
    validateLevel(next);
    draft = next;
    saveDraft();
  }
  // The Edges control: which sides of an outlined block are drawn. FULL is stored as "no field".
  function setEdges(value: Edges | "") {
    if (selected < 0) return;
    const next = changed((piece) => {
      if (value) piece.edges = value;
      else delete piece.edges;
    }, (o) => OUTLINED.includes(o.type));
    validateLevel(next);
    draft = next;
    saveDraft();
  }
  function pointermove(e: PointerEvent) {
    if (stroke && e.pointerId === stroke.id) {
      // where the finger is now, so a pinch that ends the stroke starts from here
      fingers.set(e.pointerId, [e.clientX, e.clientY]);
      if (fingers.size === 1) {
        const view = draw();
        strokeTo([view.x(e.clientX), view.y(e.clientY)]);
      }
      return;
    }
    if (sweep && fingers.has(e.pointerId) && fingers.size === 1) {
      const view = draw();
      sweep = { ...sweep, to: [view.x(e.clientX), view.y(e.clientY)] };
      return;
    }
    if (!pinch || !fingers.has(e.pointerId) || selected < 0) return;
    fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (fingers.size < 2) return;
    const [a, b] = [...fingers.values()],
      before = draft.objects[selected],
      next = pinchTransform(
        pinch,
        a,
        b,
        snap,
        SCALABLE.includes(before.type),
        TURNABLE.includes(before.type),
      ),
      [kx, ky] = axes(before);
    // a pinch that changes nothing converts nothing (#117)
    if (next.scaleX === kx && next.scaleY === ky && next.rotation === before.rotation) return;
    const piece = resized(before, next.scaleX, next.scaleY);
    piece.rotation = next.rotation;
    const level = {
      ...draft,
      objects: draft.objects.map((o, i) => (i === selected ? piece : o)),
    };
    try {
      validateLevel(level);
    } catch {
      return; // past the ceiling or the size bound: hold the last good shape
    }
    draft = level;
  }
  function pointerup(e: PointerEvent) {
    run.release();
    // a lift, a cancel or a lost capture of the stroke's finger ends the stroke (rule 6d)
    if (stroke?.id === e.pointerId) endStroke(false);
    if (!fingers.delete(e.pointerId)) return;
    if (!fingers.size) endSweep();
    if (pinch && fingers.size < 2) {
      pinch = null;
      saveDraft();
    }
  }
  function deleteSelected() {
    if (selected < 0) return;
    draft.objects = draft.objects.filter((_, i) => !group.includes(i));
    select(-1);
    saveDraft();
  }
  function duplicate() {
    try {
      const copies =
        group.length > 1 ? duplicateGroup(draft, group) : [duplicateObject(draft, selected)];
      draft.objects.push(...copies);
      group = copies.map((_, i) => draft.objects.length - copies.length + i);
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
              select(-1);
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
      "Door: tap for the square's hop. Hold from takeoff to clear up to four blocks. Release to shorten the jump. " +
      "Square: tap or press Space to jump onto two-block ledges. Hold for another jump when you land. Pogo: same as square, but every fresh tap lets you jump again in midair. Jump before a wall to clear it. Try Air Steps! Plane: hold to fly against gravity; release to fall. Landings and ceiling contact are safe while flying, but wall impacts kill. Angle: hold to climb at 45 degrees, release to dive at 45 degrees. The floor and the ceiling are safe to slide along; touching any block, ramp or curve is a crash, unless a W stops you at its side or an R bumps your head. Wheel: land on a block, floor or ceiling, then tap or press Space to flip gravity. Midair taps are ignored; holding does not flip again when you land. Croissant: land, then tap to teleport straight across to the floor, ceiling or block on the other side, with gravity flipped. UP and DOWN portals set gravity without changing your shape. Speed portals change how fast you move forward: SLOW, 1X, FAST and FASTER. Shape and gravity stay the same. Under upside-down gravity, land and jump on ceilings. All spikes kill, including the tiny quarter-size ones. Outline blocks are transparent but solid. Hitting a wall kills in ALL modes, including the vertical face of a ramp. Your smaller hazard hitbox still forgives edge grazes. Background blocks never collide. Rings: tap or press Space while reaching a glowing ring for a midair jump, once per ring per run. Purple and red rings bounce one and five blocks; a white ring takes any colour and height. A dark blue gravity ring flips your gravity and you drop the new way at once; a green one flips it and bounces you away from the new gravity. UP and DOWN portals drop you the new way at once too. Hold on a pink dash orb and you dash the way it points, with no gravity, until you let go: turn it with the angle slider to aim it. A yellow dash orb flips your gravity as well. A black ring sends you down fast, as if you had been falling for a while; a gray ring stops your rise or fall. Boosters are flat pads with no tap: touch one and it does what its ring does, once each time you land on it. Turn one upside down for a ceiling. The Width and Height sliders size any piece but a trigger: it stretches out both ways from its middle, and turning it keeps it in place. A pinch sizes both at once and keeps its shape.EDIT OBJECT switches a piece to NO TOUCH (seen, never touched), HIDDEN (touched, never seen in play; faint in the editor), WALL PASS (its sides stop you, like a W) or ROOF PASS (you bump your head, like an R). Wall pass (W) and roof pass (R) are invisible in play: lay them over blocks, or right where you hit them. While you touch a W, a wall stops you instead of crashing you, and a jump over it carries on; while you touch an R, you bump your head and fall back instead of crashing. Spikes still kill. Ramps: walk up or down the white diagonal slope. Curves are rounded ramps: a scoop bends up like a skate ramp, a hill bulges out: run into its side and you ride up it. Find RINGS and RAMP tabs in the editor. In the editor, pinch a selected piece with two fingers to size it and turn it, like cropping a photo; Snap holds 15 degrees and quarter sizes. MULTI selects a group: tap pieces to add them, or swipe a box over a lot of them, then move, turn, flip, copy or delete them together. Edge, parallel, outer corner, inner corner and no outline blocks are solid blocks with the white line on only some sides (or none, for the middle of a shape), so a big shape reads as one piece: turn them to face the outside, and pick EDGES on any selected block. Coins: touch one to pick it up; a level holds up to 10, and your best is the most you picked up in one finished run. Triggers are invisible in play and fire once when you run past them. Tick TOUCH to fire one when you touch it instead, and MULTI to fire it every time you touch it again. MULTI TOUCH in EDIT OBJECT lets a ring work again every time you come back to it. Give pieces a GROUP ID in EDIT OBJECT, then a MOVE trigger slides every piece in that group some blocks over a time you choose, and a COLOR trigger paints them a colour. Find them on the COINS and TRIGGERS tabs.",
    );
  }
  // Every check says what it found, so a tap never looks like nothing happened. A pull is
  // already a yes, so a pull that finds a new version installs it.
  async function checkForUpdate(fromPull = false): Promise<UpdateCheck> {
    checking = true;
    try {
      const found = updater ? await updater.check() : "unreachable";
      if (found === "newer" && fromPull) {
        await applyUpdate();
        return found;
      }
      toast(
        found === "newer"
          ? "A new version is ready. Tap NEW VERSION READY to get it."
          : found === "current"
            ? `You have the newest version, v${__APP_VERSION__}.`
            : "Could not check for updates. Check the internet and try again.",
      );
      return found;
    } finally {
      checking = false;
    }
  }
  // Pull down from the top of the home or My Levels screen to check for updates, the way a
  // feed refreshes. Half the finger travel shows, and RELEASE_AT of it checks.
  const RELEASE_AT = 70;
  let pullFrom: number | null = null;
  function pullStart(e: TouchEvent) {
    const screen = e.currentTarget as HTMLElement,
      list = (e.target as Element).closest("#levels");
    pullFrom =
      e.touches.length === 1 &&
      screen.scrollTop <= 0 &&
      !(list && list.scrollTop > 0) &&
      !checking &&
      !updating
        ? e.touches[0].clientY
        : null;
  }
  function pullMove(e: TouchEvent) {
    if (pullFrom === null) return;
    if ((e.currentTarget as HTMLElement).scrollTop > 0) {
      pullFrom = null;
      pull = 0;
      return;
    }
    pull = Math.max(0, Math.min(110, (e.touches[0].clientY - pullFrom) / 2));
  }
  async function pullEnd() {
    const release = pull >= RELEASE_AT;
    pullFrom = null;
    pull = 0;
    if (!release) return;
    pulled = true;
    try {
      await checkForUpdate(true);
    } finally {
      pulled = false;
    }
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
    // the marker first, then the stores: a load in another tab between the two still changes the
    // marker, so this tab's first write reloads instead of writing (#124)
    try {
      importSeen = localStorage.getItem(IMPORT);
      importCutOff = importSeen !== null && JSON.parse(importSeen).state === "pending";
    } catch {
      /* no storage: the save below reports it */
    }
    try {
      save = readSave(localStorage.getItem(SAVE), LEVELS.length);
    } catch {
      storageOK = false;
    }
    draft = structuredClone(save.draft);
    try {
      skins = readSkins(localStorage.getItem(SKINS));
    } catch {
      // never replaced by fallback data: the green cube shows and every skin write is refused
      skinsBroken = true;
    }
    try {
      loops = readLoops(localStorage.getItem(LOOPS));
    } catch {
      loopsBroken = true; // left as stored; every loop write is refused until it reads
    }
    nextTrail();
    orientation();
    document.body.dataset.mode = mode;
    if (!storageOK) persist();
    if (importCutOff) cutOffSheet();
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
    // another tab saved skins: show them (each write here re-reads anyway). Another tab loaded a
    // whole save: reload now (the fast path; every write checks the marker itself too)
    window.addEventListener(
      "storage",
      (e) => {
        if (e.key === IMPORT && stale()) return;
        if (e.key === LOOPS || e.key === null)
          try {
            loops = readLoops(localStorage.getItem(LOOPS));
            loopsBroken = false;
          } catch {
            loops = emptyLoops();
            loopsBroken = true;
          }
        if (e.key !== SKINS && e.key !== null) return;
        try {
          skins = readSkins(localStorage.getItem(SKINS));
          skinsBroken = false;
        } catch {
          skins = emptyStore();
          skinsBroken = true;
        }
      },
      { signal },
    );
    window.addEventListener(
      "keyup",
      (e) => {
        if (e.code === "Space" || e.code === "ArrowUp") run.release();
      },
      { signal },
    );
    canvas.addEventListener("pointerdown", pointerdown, { signal });
    canvas.addEventListener("pointermove", pointermove, { signal });
    for (const event of ["pointerup", "lostpointercapture"] as const)
      canvas.addEventListener(event, pointerup, { signal });
    canvas.addEventListener(
      "pointercancel",
      (e) => {
        run.interrupt();
        pointerup(e);
      },
      { signal },
    );
    installer = installControl(
      (value) => (installVisible = value),
      () => {
        void sheet(
          "Install Cube Dash",
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
  aria-label="Cube Dash playfield. Space or touch to jump, hold to fly, tap to flip wheel gravity."
></canvas>
<span class="version" aria-label="App version">v{__APP_VERSION__}</span>
<div
  id="pull"
  aria-hidden="true"
  hidden={!pull && !pulled}
  style:transform={`translate(-50%, ${pulled ? 40 : pull}px)`}
>
  {pulled
    ? updating
      ? "UPDATING…"
      : "CHECKING…"
    : pull >= RELEASE_AT
      ? "LET GO TO CHECK FOR UPDATES"
      : "PULL TO CHECK FOR UPDATES"}
</div>
<main
  id="home"
  class="screen"
  hidden={mode !== "home"}
  ontouchstart={pullStart}
  ontouchmove={pullMove}
  ontouchend={pullEnd}
  ontouchcancel={pullEnd}
>
  <header class="home-head">
    <a
      class="brand"
      href="/"
      aria-label="Cube Dash home"
      onclick={(e) => {
        e.preventDefault();
        home();
      }}><img src="/icon.svg" alt="" width="44" height="44" />CUBE DASH</a
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
      ><button id="editor-open" class="editor-open" onclick={openEditor}>＋ LEVEL EDITOR</button>
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
</main>
<!-- the house bottom bar (kidgames STANDARD: menus only; play and the editor keep the whole screen) -->
{#if mode === "home" || mode === "library" || mode === "loops" || (mode === "skins" && !drafting)}
  <nav id="dock" aria-label="Cube Dash">
    {#each DOCK as [tab, id, label, icon]}
      <button
        {id}
        aria-current={mode === tab ? "page" : undefined}
        onclick={() => goTab(tab)}
        ><svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>{label}</button
      >
    {/each}
    <button id="more" onclick={more}
      ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01" /></svg
      >MORE</button
    >
  </nav>
{/if}
<section
  id="library"
  class="screen"
  aria-label="My levels"
  hidden={mode !== "library"}
  ontouchstart={pullStart}
  ontouchmove={pullMove}
  ontouchend={pullEnd}
  ontouchcancel={pullEnd}
>
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
    {#each save.customLevels as { id, level, coins } (id)}<article class="custom-card">
        <h2>{level.name}</h2>
        <p>
          {level.length} × {levelHeight(level)} blocks · {level.objects.length} pieces
          · ♪ {level.loop ? loopName(level.loop) : trackName(level.song ?? 8 + id)}{#if coinCount(level)}
            · <span class="best-coins"
              >best {shownCoins(coins, level)} / {coinCount(level)} coins</span
            >{/if}
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
            onclick={() => sharing(level.loop ? level : { ...level, song: level.song ?? 8 + id })}
            >SHARE</button
          >
          <button
            aria-label={`Delete ${level.name}`}
            onclick={() => deleteCustom(id, level.name)}>DELETE</button
          >
        </div>
      </article>{/each}
  </div>
</section>
{#if mode === "skins"}<SkinCreator
    store={skins}
    broken={skinsBroken}
    commit={commitSkin}
    confirm={askSkin}
    share={(skin) => skinSheet({ skin })}
    importSkin={() => skinSheet({})}
    back={home}
    bind:editing={drafting}
  />{/if}
{#if mode === "loops"}<LoopMaker
    bind:this={loopMaker}
    store={loops}
    broken={loopsBroken}
    commit={commitLoop}
    confirm={askSkin}
    share={(loop) => loopSheet({ loop })}
    importLoop={() => loopSheet({})}
    back={home}
  />{/if}
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
  <span id="coins" hidden={!hud.coins} aria-label={`Coins ${hud.coins}`}
    ><span class="coin-dot" aria-hidden="true"></span>{hud.coins}</span
  ><span id="attempt">TRY {hud.attempt}</span><button
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
      id="try-level"
      class:primary={testing}
      aria-pressed={testing}
      onclick={tryLevel}>{testing ? "■ STOP" : "▶ TRY"}</button
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
      ><button
        id="multi-tool"
        aria-pressed={tool === "multi"}
        onclick={() => (tool = "multi")}>MULTI</button
      ><button
        id="swipe-tool"
        aria-pressed={swipe}
        aria-label="Swipe to place or erase"
        onclick={toggleSwipe}>SWIPE</button
      >{#if swipe}<button
          id="erase-tool"
          aria-pressed={tool === "erase"}
          onclick={() => (tool = "erase")}>ERASE</button
        ><button id="undo" disabled={!canUndo} onclick={undo}>UNDO</button
        ><button id="redo" disabled={!canRedo} onclick={redo}>REDO</button
        >{/if}<button id="duplicate-object" disabled={!selection} onclick={duplicate}
        >COPY + PASTE</button
      ><button id="edit-object" disabled={!selection} onclick={editObject}
        >EDIT OBJECT</button
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
            select(-1);
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
      ><label
        >Snap <input
          id="snap"
          type="checkbox"
          aria-label="Snap pinch to 15 degrees and quarter sizes"
          bind:checked={snap}
        /></label
      ><label
        >Width <input
          id="scale-x"
          type="range"
          min="0.25"
          max="4"
          step="0.05"
          aria-label="Width"
          value={selection ? axes(selection)[0] : 1}
          disabled={!selection || !SCALABLE.includes(selection.type)}
          oninput={(e) => setAxis(0, +e.currentTarget.value)}
        /></label
      ><label
        >Height <input
          id="scale-y"
          type="range"
          min="0.25"
          max="4"
          step="0.05"
          aria-label="Height"
          value={selection ? axes(selection)[1] : 1}
          disabled={!selection || !SCALABLE.includes(selection.type)}
          oninput={(e) => setAxis(1, +e.currentTarget.value)}
        /></label
      ><label
        >Angle <input
          id="angle"
          type="range"
          min="0"
          max="359"
          step="1"
          aria-label="Angle"
          value={selection?.rotation ?? 0}
          disabled={!selection || !(TURNABLE.includes(selection.type) || selection.dash)}
          oninput={(e) => setAngle(+e.currentTarget.value)}
        /></label
      ><label
        >Colour <select
          id="ring-color"
          aria-label="Ring colour"
          value={selection?.color ?? RING_COLORS[0][0]}
          disabled={!selection || !RINGS.includes(selection.type)}
          onchange={(e) => setRing({ color: e.currentTarget.value })}
          >{#each RING_COLORS as [hex, name]}<option value={hex}>{name}</option
            >{/each}</select
        ></label
      ><label
        >Bounce <input
          id="bounce"
          type="range"
          min="0.25"
          max="10"
          step="0.25"
          aria-label="Bounce height"
          value={selection?.bounce ?? RING_BOUNCE}
          disabled={selection?.type !== "ring" || selection.flipsGravity || selection.dash}
          oninput={(e) => setRing({ bounce: +e.currentTarget.value })}
        /></label
      ><label
        >Edges <select
          id="edges"
          aria-label="Block edges"
          value={selection?.edges ?? ""}
          disabled={!selection || !OUTLINED.includes(selection.type)}
          onchange={(e) => setEdges(e.currentTarget.value as Edges | "")}
          >{#each EDGE_NAMES as [value, name]}<option {value}>{name}</option
            >{/each}</select
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
        >{testing
          ? `TRY ${hud.attempt}${hud.coins ? ` · COINS ${hud.coins}` : ""} · ${hud.cue} · ${hud.detail} · ESC OR STOP TO EDIT`
          : group.length > 1
          ? `${group.length} PIECES · MOVE, TURN, FLIP, COPY OR DELETE THEM TOGETHER`
          : selection
          ? `${labelOf(selection.type)} · x ${selection.x.toFixed(2)} / y ${selection.y.toFixed(2)} · ${selection.rotation}° · ${axes(selection)[0] === axes(selection)[1] ? `×${axes(selection)[0].toFixed(2)}` : `${axes(selection)[0].toFixed(2)} × ${axes(selection)[1].toFixed(2)}`}${selection.type === "ring" ? (selection.dash ? (selection.flipsGravity ? " · ➤ DASH + GRAVITY" : " · ➤ DASH") : selection.flipsGravity ? (selection.boost ? " · ⇈ GRAVITY + BOUNCE" : " · ⇅ GRAVITY") : ` · ↑${selection.bounce ?? RING_BOUNCE}`) : selection.type === "drop-ring" ? " · ↓ DROP" : selection.type === "stop-ring" ? " · − STOP" : ""}${selection.edges ? ` · ${EDGE_NAMES.find(([v]) => v === selection.edges)?.[1]}` : ""}${OPTIONS.filter(([key, , , fit]) => selection[key] && fit(selection)).map(([, name]) => ` · ${name}`).join("")}${selection.group ? ` · GROUP ${selection.group}` : ""}${triggerText(selection)}`
          : tool === "select"
            ? "Tap an object to select it."
            : tool === "multi"
              ? "Tap pieces to add them, or swipe a box over a lot of them."
            : tool === "erase"
              ? "Swipe over pieces to take them away."
            : `${swipe ? "Tap or swipe across" : "Tap"} the grid to place ${tool === "half" ? "a half spike" : article(tool in presets ? tool.replace("-", " ") : tool.startsWith("speed-") ? labelOf(tool).toLowerCase() + " portal" : PADS.includes(tool) ? labelOf(tool).toLowerCase() : tool)}.`}{layer ===
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
  <h2>Turn sideways to build</h2>
  <p>The level editor needs the room.</p>
  <button id="rotate-menu" onclick={library}>MY LEVELS</button>
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
      {#if panel.extra === "object" && selection}<div class="object-settings">
          {#if TRIGGERS.includes(selection.type)}<label
              >Group id it works on<input
                id="trigger-target"
                type="number"
                inputmode="numeric"
                min="1"
                max={MAX_GROUP}
                step="1"
                value={selection.target ?? ""}
                onchange={(e) => setTrigger("target", e.currentTarget)}
              /></label
            >{#if selection.type === "move-trigger"}<label
                >Move right (blocks, minus is left)<input
                  id="trigger-move-x"
                  type="number"
                  inputmode="numeric"
                  step="1"
                  value={selection.moveX ?? 0}
                  onchange={(e) => setTrigger("moveX", e.currentTarget)}
                /></label
              ><label
                >Move up (blocks, minus is down)<input
                  id="trigger-move-y"
                  type="number"
                  inputmode="numeric"
                  step="1"
                  value={selection.moveY ?? 0}
                  onchange={(e) => setTrigger("moveY", e.currentTarget)}
                /></label
              >{:else}<label
                >Colour<select
                  id="trigger-color"
                  value={selection.color ?? RING_COLORS[0][0]}
                  onchange={(e) => setTrigger("color", e.currentTarget)}
                  >{#each RING_COLORS as [hex, name]}<option value={hex}>{name}</option
                    >{/each}</select
                ></label
              >{/if}<label
              >Time (seconds, 0 is instant)<input
                id="trigger-time"
                type="number"
                inputmode="decimal"
                min="0"
                max={MAX_TRIGGER_TIME}
                step="0.1"
                value={selection.duration ?? 0}
                onchange={(e) => setTrigger("duration", e.currentTarget)}
              /></label
            ><label class="check"
              ><input
                id="trigger-touch"
                type="checkbox"
                checked={!!selection.touch}
                onchange={(e) => setTouch("touch", e.currentTarget.checked)}
              />TOUCH: fires when you touch it, not when you pass it</label
            >{#if selection.touch}<label class="check"
                ><input
                  id="trigger-multi"
                  type="checkbox"
                  checked={!!selection.multi}
                  onchange={(e) => setTouch("multi", e.currentTarget.checked)}
                />MULTI: fires every time you touch it again</label
              >{/if}{:else}<label
              >Group id (1–{MAX_GROUP}, blank for none)<input
                id="group-id"
                type="number"
                inputmode="numeric"
                min="0"
                max={MAX_GROUP}
                step="1"
                value={selection.group ?? ""}
                onchange={(e) => setGroup(e.currentTarget)}
              /></label
            >{/if}
        </div>{/if}
      <div class="buttons">
        {#each panel.actions as [label, handler, primary]}<button
            class:primary
            onclick={handler}>{label}</button
          >{/each}
      </div>
      {#if panel.extra === "transfer"}{#key transfer}<LevelTransfer
            {...transfer}
            add={addSharedLevel}
            addSkin={addSharedSkin}
            addLoop={addSharedLoop}
          />{/key}{/if}
      {#if panel.extra === "save"}{#key moving}<SaveMove
            initial={moving.initial}
            read={storedSave}
            trails={LEVELS.length}
            replace={replaceSave}
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
              value={draft.loop ? "this-loop" : String(draftSong())}
              onchange={(e) => {
                // one song source (#121): a loop is a copy of the saved one, so editing or
                // deleting that loop later never changes this level; a song clears the loop
                const value = e.currentTarget.value,
                  { song: _song, loop: _loop, ...rest } = draft;
                if (value === "this-loop") return;
                const picked = value.startsWith("loop:")
                  ? loops.loops.find((entry) => entry.id === Number(value.slice(5)))
                  : undefined;
                draft = picked
                  ? { ...rest, loop: validateLoop(structuredClone(picked.loop)) }
                  : { ...rest, song: Number(value) };
                saveDraft();
              }}
              >{#if draft.loop}<option value="this-loop"
                  >♪ {loopName(draft.loop)} · this level’s loop</option
                >{/if}{#if loops.loops.length}<optgroup label="MY LOOPS"
                  >{#each loops.loops as entry (entry.id)}<option value={`loop:${entry.id}`}
                      >{loopName(entry.loop)}</option
                    >{/each}</optgroup
                >{/if}<optgroup label="SONGS"
                >{#each songs as index}<option value={String(index)}
                    >{trackName(index)}{index === 8 + save.activeLevel
                      ? " · this level’s original"
                      : ""}</option
                  >{/each}</optgroup
              ></select
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
        <button id="check-update" disabled={checking} onclick={() => checkForUpdate()}
          >{checking ? "CHECKING…" : "CHECK FOR UPDATE"}</button
        ><button id="move-save" onclick={() => moveSave()}>MOVE YOUR SAVE</button><a
          class="about-link"
          href="/licenses.md"
          target="_blank"
          rel="noopener">Licences</a
        >
        <p>
          Music by <a
            class="about-link"
            href="https://fardifferent.carrd.co/"
            target="_blank"
            rel="noopener">Of Far Different Nature</a
          >, licensed under CC BY 4.0.
        </p>
        <a class="about-link" href="/music/credits.html" target="_blank" rel="noopener"
          >Songs and music credits</a
        >
        <div class="maker">
          made with <svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="M12 21 3 12C-4 4 6-3 12 5 18-3 28 4 21 12Z" /></svg
          ><span class="sr">love</span>
          by
          <a href="https://royashbrook.com" target="_blank" rel="noopener"
            >roy</a
          >
          +
          <a
            href="https://royashbrook.com/agents"
            target="_blank"
            rel="noopener">ai</a
          >
          <span class="maker-tail"
            ><span aria-hidden="true" class="maker-dot">·</span>
            <a
              href="https://github.com/sponsors/royashbrook"
              target="_blank"
              rel="noopener">sponsor me</a
            ></span
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
