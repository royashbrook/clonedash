<script lang="ts">
  import { onMount } from "svelte";
  import QRCode from "qrcode";
  import { codeKind, decodeLevel, encodeLevel, levelLink, MAX_CODE } from "./transfer.ts";
  import { decodeSkin, encodeSkin, paintThumb, skinLink, skinName, type Skin } from "./skin.ts";
  import { trackFor } from "./music.ts";
  import { blankLoop, decodeLoop, encodeLoop, loopLink, loopName, type Loop } from "./loop.ts";
  import { LoopPlayer } from "./loop-player.ts";
  import LoopGrid from "./LoopGrid.svelte";
  import type { Level } from "./types.ts";

  // One sheet shares a level or a skin, and imports either: a pasted code, link or file goes to
  // the level or the skin decoder by its prefix (transfer.ts codeKind, docs/skins.md).
  let {
    level,
    skin,
    loop,
    initial = "",
    add,
    addSkin,
    addLoop,
  }: {
    level?: Level;
    skin?: Skin;
    loop?: Loop;
    initial?: string;
    add: (level: Level) => void;
    addSkin: (skin: Skin) => void;
    addLoop: (loop: Loop) => void;
  } = $props();
  let input = $state(""),
    code = $state(""),
    link = $state("");
  let preview = $state.raw<Level | null>(null),
    skinPreview = $state.raw<Skin | null>(null),
    loopPreview = $state.raw<Loop | null>(null),
    qr = $state("");
  let busy = $state(true),
    message = $state(""),
    failed = $state(false);
  let nativeShare = $state(false),
    showCode = $state(false);
  let file = $state.raw<File | undefined>(),
    download = $state("");
  let alive = false;
  // an incoming loop is heard only on a tap, and every change of what is shown silences it
  let auditing = $state(false),
    auditStep = $state(-1);
  const auditor = new LoopPlayer(() => loopPreview ?? blankLoop(), (s) => (auditStep = s));
  function hush() {
    auditor.stop();
    auditing = false;
    auditStep = -1;
  }
  async function audition() {
    if (auditing) return hush();
    auditing = true;
    try {
      await auditor.start();
    } catch {
      auditing = false;
    }
  }

  function error(cause: unknown) {
    failed = true;
    message =
      cause instanceof Error ? cause.message : "Could not open this level.";
  }
  async function prepare() {
    try {
      const encoded = skin ? await encodeSkin(skin) : loop ? await encodeLoop(loop) : await encodeLevel(level!);
      if (!alive) return;
      code = encoded;
      link = skin ? skinLink(code, location.href) : loop ? loopLink(code, location.href) : levelLink(code, location.href);
      // the .clonedash.txt ending stays: the import picker and older copies of the game look for it
      file = new File([code], skin ? "cube-dash-skin.clonedash.txt" : loop ? "cube-dash-loop.clonedash.txt" : "cube-dash-level.clonedash.txt", {
        type: "text/plain",
      });
      download = URL.createObjectURL(file);
      // Cap QR density for a phone display. A larger level still has its complete code/file.
      if (link.length <= 2000) {
        const symbol = QRCode.create(link, { errorCorrectionLevel: "M" });
        if (symbol.version <= 15) {
          const image = await QRCode.toDataURL(link, {
            version: symbol.version,
            errorCorrectionLevel: "M",
            margin: 4,
            width: 340,
          });
          if (alive) qr = image;
        }
      }
    } catch (cause) {
      if (alive) error(cause);
    } finally {
      if (alive) busy = false;
    }
  }
  async function inspect(text = input) {
    busy = true;
    message = "";
    failed = false;
    hush();
    preview = null;
    skinPreview = null;
    loopPreview = null;
    try {
      const kind = codeKind(text);
      if (kind === "save")
        throw Error("This is a whole save, not a level, skin or loop. Load it from ABOUT → MOVE YOUR SAVE.");
      if (kind === "loop") {
        const decoded = await decodeLoop(text);
        if (alive) loopPreview = decoded;
        return;
      }
      if (kind === "skin") {
        const decoded = await decodeSkin(text);
        if (alive) skinPreview = decoded;
        return;
      }
      const decoded = await decodeLevel(text);
      if (alive) preview = decoded;
    } catch (cause) {
      if (alive) error(cause);
    } finally {
      if (alive) busy = false;
    }
  }
  async function readFile(event: Event) {
    const picked = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!picked) return;
    hush();
    preview = null;
    skinPreview = null;
    loopPreview = null;
    message = "";
    busy = true;
    try {
      if (picked.size > MAX_CODE) throw Error("This level file is too large.");
      const text = await picked.text();
      if (!alive) return;
      input = text;
      await inspect(text);
    } catch (cause) {
      if (alive) {
        error(cause);
        busy = false;
      }
    }
  }
  async function share() {
    message = "";
    failed = false;
    // Everything was prepared before this fresh tap, preserving native share activation.
    const title = skin ? skinName(skin) : loop ? loopName(loop) : level!.name;
    const data: ShareData =
      link.length <= 4096
        ? { title, text: skin ? "Wear my Cube Dash skin" : loop ? "Hear my Cube Dash loop" : "Play my Cube Dash level", url: link }
        : { title, files: [file!] };
    try {
      if (navigator.canShare && !navigator.canShare(data))
        throw Error("Use COPY CODE or DOWNLOAD FILE on this device.");
      await navigator.share(data);
    } catch (cause) {
      if (alive && !(cause instanceof Error && cause.name === "AbortError"))
        error(cause);
    }
  }
  async function copy() {
    failed = false;
    message = "";
    try {
      await navigator.clipboard.writeText(code);
      if (alive) message = "Code copied.";
    } catch {
      if (!alive) return;
      showCode = true;
      message = "Select and copy the code below.";
    }
  }
  function confirm() {
    try {
      hush();
      if (loopPreview) addLoop(loopPreview);
      else if (skinPreview) addSkin(skinPreview);
      else if (preview) add(preview);
    } catch (cause) {
      error(cause);
    }
  }
  function thumb(node: HTMLCanvasElement, value: Skin) {
    paintThumb(node, value);
    return { update: (next: Skin) => paintThumb(node, next) };
  }
  onMount(() => {
    alive = true;
    input = initial;
    nativeShare = typeof navigator.share === "function";
    if (level || skin || loop) void prepare();
    else if (initial) void inspect();
    else busy = false;
    const hide = () => document.hidden && hush();
    document.addEventListener("visibilitychange", hide);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", hide);
      if (download) URL.revokeObjectURL(download);
      void auditor.close();
    };
  });
</script>

<div class="transfer" aria-busy={busy}>
  {#if loop}
    <h3>{loopName(loop)}</h3>
    <p>Send this loop. Your levels, progress, skins and other loops stay private.</p>
  {:else if skin}
    <h3>{skinName(skin)}</h3>
    <p>Send this skin. Your levels, progress and other skins stay private.</p>
  {:else if level}
    <h3>{level.name || "Untitled trail"}</h3>
    <p>Send this level. Your other levels and progress stay private.</p>
  {/if}
  {#if level || skin || loop}
    {#if busy}<p role="status">Preparing…</p>
    {:else if code}
      {#if nativeShare}<button id="send-level" class="primary" onclick={share}
          >{skin ? "SHARE SKIN" : loop ? "SHARE LOOP" : "SHARE LEVEL"}</button
        >{/if}
      {#if qr}<img
          class="level-qr"
          src={qr}
          width="340"
          height="340"
          alt={`Scan to preview ${skin ? skinName(skin) : loop ? loopName(loop) : level?.name || "this level"}`}
        />
      {:else}<p class="qr-fallback">
          Too much detail for a clear QR. Send the complete code or file
          instead.
        </p>{/if}
      <button id="copy-level" onclick={copy}>COPY CODE</button>
      <a class="download-level" href={download} download={file?.name}
        >DOWNLOAD FILE</a
      >
      <details bind:open={showCode}>
        <summary>{skin ? "Skin code" : loop ? "Loop code" : "Level code"}</summary>
        <label for="level-code"
          >{skin ? "Copy into My skins → Import skin" : loop ? "Copy into My loops → Import loop" : "Copy into My Levels → Import level"}</label
        >
        <textarea
          id="level-code"
          readonly
          value={code}
          onclick={(e) => e.currentTarget.select()}></textarea>
      </details>
    {/if}
  {:else}
    <label for="import-code">Paste a level, skin or loop code or link</label>
    <textarea
      id="import-code"
      maxlength={MAX_CODE}
      bind:value={input}
      disabled={busy}
      oninput={() => {
        preview = null;
        hush();
        skinPreview = null;
        loopPreview = null;
        message = "";
      }}
      spellcheck="false"
      autocapitalize="off"></textarea>
    <button
      id="preview-level"
      class="primary"
      disabled={busy || !input.trim()}
      onclick={() => inspect()}>PREVIEW</button
    >
    <label class="file-label" for="level-file">Or open a level, skin or loop file</label>
    <input
      id="level-file"
      type="file"
      accept=".txt,.clonedash,text/plain"
      disabled={busy}
      onchange={readFile}
    />
    {#if busy}<p role="status">Checking…</p>{/if}
    {#if loopPreview}
      <section class="import-preview" aria-label="Loop preview">
        <h3>{loopName(loopPreview)}</h3>
        <p>Key {["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][loopPreview.root % 12]} · wobble {loopPreview.wobble}{loopPreview.drop ? " · drop" : ""} · {loopPreview.notes.flat().length} notes</p>
        <LoopGrid loop={loopPreview} now={auditStep} />
        <button id="play-import-loop" aria-pressed={auditing} onclick={audition}
          >{auditing ? "■ STOP" : "▶ PLAY"}</button
        >
        <p>Adds a new loop to My loops. Nothing is replaced.</p>
        <button id="add-loop" class="primary" onclick={confirm}>ADD TO MY LOOPS</button>
      </section>
    {/if}
    {#if skinPreview}
      <section class="import-preview" aria-label="Skin preview">
        <h3>{skinName(skinPreview)}</h3>
        <div class="skin-thumb"><canvas use:thumb={skinPreview} aria-hidden="true"></canvas></div>
        <p>{skinPreview.width} × {skinPreview.height} pixels · {skinPreview.palette.length} colours</p>
        <p>
          Adds a new skin to My skins. Nothing is replaced, and you keep wearing what you wear now
          until you pick USE.
        </p>
        <button id="add-skin" class="primary" onclick={confirm}>ADD TO MY SKINS</button>
      </section>
    {/if}
    {#if preview}
      <section class="import-preview" aria-label="Level preview">
        <h3>{preview.name || "Untitled trail"}</h3>
        <p>
          {preview.length} × {preview.height ?? 7} blocks · {preview.objects
            .length} pieces<br />♪ {preview.arrangement ? `${preview.arrangement.name || "Untitled song"} (its own song)` : preview.loop ? `${loopName(preview.loop)} (its own loop)` : trackFor(preview.song!).name}
        </p>
        <p>
          Adds a new level. Nothing you have made or earned will be replaced.
        </p>
        <button id="add-level" class="primary" onclick={confirm}
          >ADD TO MY LEVELS</button
        >
      </section>
    {/if}
  {/if}
  <p class:failed role="status" hidden={!message}>{message}</p>
</div>

<style>
  .transfer {
    min-width: 0;
  }
  h3 {
    overflow-wrap: anywhere;
    margin: 16px 0 8px;
  }
  label {
    display: block;
    font-size: 14px;
    margin: 12px 0 8px;
  }
  textarea {
    display: block;
    width: 100%;
    min-height: 80px;
    padding: 10px;
    resize: vertical;
    border: 1px solid var(--line);
    border-radius: 8px;
    font: 16px var(--font-mono);
    background: var(--surface-sunk);
    color: var(--ink);
  }
  textarea:focus-visible {
    outline: 3px solid var(--accent);
  }
  .level-qr {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 16px auto;
    image-rendering: pixelated;
  }
  .download-level,
  summary {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    margin-top: 10px;
    cursor: pointer;
    color: var(--ink);
  }
  .download-level {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    font-size: 14px;
    font-weight: 800;
    padding: 10px;
  }
  input[type="file"] {
    width: 100%;
    min-height: 44px;
    font: 14px var(--font-ui);
  }
  input::file-selector-button {
    min-height: 44px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-sunk);
    color: var(--ink);
    padding: 8px;
    margin-right: 8px;
  }
  .skin-thumb {
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
    border-radius: 8px;
    background: repeating-conic-gradient(#26364a 0 25%, #1b2939 0 50%) 0 0 / 16px 16px;
  }
  .skin-thumb canvas {
    image-rendering: pixelated;
  }
  .import-preview {
    border-top: 1px solid var(--line);
    margin-top: 16px;
  }
  .failed {
    color: var(--warn);
  }
</style>
