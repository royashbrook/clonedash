<script lang="ts">
  import { onMount } from "svelte";
  import QRCode from "qrcode";
  import {
    MAX_BACKUP_BYTES,
    backupLink,
    decodeBackup,
    encodeBackup,
    sameData,
    summary,
    type Backup,
  } from "./backup.ts";

  // Moving a whole save (#124, src/backup.ts). SEND shows this device's save as a link, QR, code
  // and file. LOAD previews a save and replaces this device's only after a tap; at that tap this
  // device's save is read again, and if it changed since the preview the numbers refresh and the
  // tap is asked for again. Arriving by link only previews, never loads.
  let {
    read,
    initial = "",
    trails,
    replace,
  }: {
    read: () => Backup; // this device's save, freshly read from storage
    initial?: string;
    trails: number;
    replace: (backup: Backup) => void;
  } = $props();
  const MAX_TEXT = Math.ceil((MAX_BACKUP_BYTES * 4) / 3) + 1024;
  let view = $state<"send" | "load">("send");
  let input = $state(""),
    code = $state(""),
    link = $state(""),
    qr = $state(""),
    download = $state(""),
    file = $state.raw<File | undefined>();
  let incoming = $state.raw<Backup | null>(null),
    here = $state.raw<Backup | null>(null),
    hereBroken = $state(false);
  let busy = $state(false),
    message = $state(""),
    failed = $state(false),
    showCode = $state(false);
  let alive = false;

  const words = (b: Backup) => {
    const s = summary(b);
    return `${s.played} built-in levels played · ${s.levels} of your own levels · ${s.skins} skins`;
  };
  function error(cause: unknown) {
    failed = true;
    message = cause instanceof Error ? cause.message : "Something went wrong. Nothing was changed.";
  }
  function readHere() {
    try {
      here = read();
      hereBroken = false;
    } catch {
      here = null;
      hereBroken = true;
    }
  }
  async function prepare() {
    view = "send";
    busy = true;
    message = "";
    failed = false;
    try {
      readHere();
      if (!here) throw Error("This device's save can't be read, so it can't be sent.");
      const encoded = await encodeBackup(here, trails);
      if (!alive) return;
      code = encoded;
      link = backupLink(code, location.href);
      file = new File([code], "cube-dash-save.clonedash.txt", { type: "text/plain" });
      if (download) URL.revokeObjectURL(download);
      download = URL.createObjectURL(file);
      qr = "";
      // the same density cap as a level; a bigger save still has its complete code and file
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
  function loadView() {
    view = "load";
    message = "";
    failed = false;
  }
  async function inspect(text = input) {
    busy = true;
    message = "";
    failed = false;
    incoming = null;
    try {
      const decoded = await decodeBackup(text, trails);
      if (!alive) return;
      readHere();
      incoming = decoded;
    } catch (cause) {
      if (alive) error(cause);
    } finally {
      if (alive) busy = false;
    }
  }
  async function readFile(event: Event) {
    const picked = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!picked) return;
    incoming = null;
    message = "";
    busy = true;
    try {
      if (picked.size > MAX_TEXT) throw Error("This save file is too large.");
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
    if (!incoming) return;
    const shown = here,
      shownBroken = hereBroken;
    readHere();
    // this device's save changed since the preview (another tab, a finished run): show the new
    // numbers and ask again rather than replace something the player has not seen
    if (hereBroken !== shownBroken || (here && shown && !sameData(here, shown))) {
      failed = true;
      message = "This device's save just changed. Check the numbers again, then tap REPLACE.";
      return;
    }
    try {
      replace(incoming);
    } catch (cause) {
      error(cause);
    }
  }
  onMount(() => {
    alive = true;
    if (initial) {
      input = initial;
      loadView();
      void inspect();
    } else void prepare();
    return () => {
      alive = false;
      if (download) URL.revokeObjectURL(download);
    };
  });
</script>

<div class="move" aria-busy={busy}>
  <div class="tabs" role="group" aria-label="Move your save">
    <button id="save-send" aria-pressed={view === "send"} disabled={busy} onclick={prepare}
      >SEND</button
    ><button id="save-load" aria-pressed={view === "load"} disabled={busy} onclick={loadView}
      >LOAD</button
    >
  </div>
  {#if view === "send"}
    <p>
      Your progress, settings, levels and skins, to open on another device. Anyone with this code
      gets a copy of them, so only send it to yourself or someone you trust.
    </p>
    {#if busy}<p role="status">Preparing…</p>
    {:else if code && here}
      <p id="save-summary">{words(here)}</p>
      {#if qr}<img
          class="save-qr"
          src={qr}
          width="340"
          height="340"
          alt="Scan to open this save on another device"
        />
      {:else}<p class="qr-fallback">
          Too big for a clear QR. Send the complete code or file instead.
        </p>{/if}
      <button id="copy-save" onclick={copy}>COPY CODE</button>
      <a class="download-save" href={download} download={file?.name}>DOWNLOAD FILE</a>
      <details bind:open={showCode}>
        <summary>Save code</summary>
        <label for="save-code">Open ABOUT → MOVE YOUR SAVE → LOAD on the other device</label>
        <textarea id="save-code" readonly value={code} onclick={(e) => e.currentTarget.select()}
        ></textarea>
      </details>
    {/if}
  {:else}
    <label for="save-input">Paste a save code or link</label>
    <textarea
      id="save-input"
      maxlength={MAX_TEXT}
      bind:value={input}
      disabled={busy}
      oninput={() => {
        incoming = null;
        message = "";
      }}
      spellcheck="false"
      autocapitalize="off"></textarea>
    <button
      id="preview-save"
      class="primary"
      disabled={busy || !input.trim()}
      onclick={() => inspect()}>PREVIEW</button
    >
    <label class="file-label" for="save-file">Or open a save file</label>
    <input
      id="save-file"
      type="file"
      accept=".txt,.clonedash,text/plain"
      disabled={busy}
      onchange={readFile}
    />
    {#if busy}<p role="status">Checking…</p>{/if}
    {#if incoming}
      <section class="import-preview" aria-label="Save preview">
        <h3>This save</h3>
        <p id="incoming-summary">{words(incoming)}</p>
        <h3>On this device now</h3>
        <p id="here-summary">{here ? words(here) : "A save that can't be read"}</p>
        <p>
          Everything on this device (progress, settings, levels and skins) is replaced by this save.
          Other open Cube Dash tabs reload.
        </p>
        <button id="replace-save" class="primary" onclick={confirm}>REPLACE THIS DEVICE'S SAVE</button>
      </section>
    {/if}
  {/if}
  <p class:failed role="status" hidden={!message}>{message}</p>
</div>

<style>
  .move {
    min-width: 0;
  }
  .tabs {
    display: flex;
    gap: 8px;
    margin: 8px 0;
  }
  .tabs button {
    flex: 1;
  }
  h3 {
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
  .save-qr {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 16px auto;
    image-rendering: pixelated;
  }
  .download-save,
  summary {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    margin-top: 10px;
    cursor: pointer;
    color: var(--ink);
  }
  .download-save {
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
  .import-preview {
    border-top: 1px solid var(--line);
    margin-top: 16px;
  }
  .failed {
    color: var(--warn);
  }
</style>
