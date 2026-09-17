<script lang="ts">
  import { onMount } from "svelte";
  import QRCode from "qrcode";
  import { decodeLevel, encodeLevel, levelLink, MAX_CODE } from "./transfer.ts";
  import { trackFor } from "./music.ts";
  import type { Level } from "./types.ts";

  let {
    level,
    initial = "",
    add,
  }: {
    level?: Level;
    initial?: string;
    add: (level: Level) => void;
  } = $props();
  let input = $state(""),
    code = $state(""),
    link = $state("");
  let preview = $state.raw<Level | null>(null),
    qr = $state("");
  let busy = $state(true),
    message = $state(""),
    failed = $state(false);
  let nativeShare = $state(false),
    showCode = $state(false);
  let file = $state.raw<File | undefined>(),
    download = $state("");
  let alive = false;

  function error(cause: unknown) {
    failed = true;
    message =
      cause instanceof Error ? cause.message : "Could not open this level.";
  }
  async function prepare() {
    try {
      const encoded = await encodeLevel(level!);
      if (!alive) return;
      code = encoded;
      link = levelLink(code, location.href);
      file = new File([code], "clone-dash-level.clonedash.txt", {
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
    preview = null;
    try {
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
    preview = null;
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
    const data: ShareData =
      link.length <= 4096
        ? { title: level!.name, text: "Play my Clone Dash level", url: link }
        : { title: level!.name, files: [file!] };
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
    if (!preview) return;
    try {
      add(preview);
    } catch (cause) {
      error(cause);
    }
  }
  onMount(() => {
    alive = true;
    input = initial;
    nativeShare = typeof navigator.share === "function";
    if (level) void prepare();
    else if (initial) void inspect();
    else busy = false;
    return () => {
      alive = false;
      if (download) URL.revokeObjectURL(download);
    };
  });
</script>

<div class="transfer" aria-busy={busy}>
  {#if level}
    <h3>{level.name || "Untitled trail"}</h3>
    <p>Send this level. Your other levels and progress stay private.</p>
    {#if busy}<p role="status">Preparing your level…</p>
    {:else if code}
      {#if nativeShare}<button id="send-level" class="primary" onclick={share}
          >SHARE LEVEL</button
        >{/if}
      {#if qr}<img
          class="level-qr"
          src={qr}
          width="340"
          height="340"
          alt={`Scan to preview ${level.name || "this level"}`}
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
        <summary>Level code</summary>
        <label for="level-code">Copy into My Levels → Import level</label>
        <textarea
          id="level-code"
          readonly
          value={code}
          onclick={(e) => e.currentTarget.select()}></textarea>
      </details>
    {/if}
  {:else}
    <label for="import-code">Paste a level code or link</label>
    <textarea
      id="import-code"
      maxlength={MAX_CODE}
      bind:value={input}
      disabled={busy}
      oninput={() => {
        preview = null;
        message = "";
      }}
      spellcheck="false"
      autocapitalize="off"></textarea>
    <button
      id="preview-level"
      class="primary"
      disabled={busy || !input.trim()}
      onclick={() => inspect()}>PREVIEW LEVEL</button
    >
    <label class="file-label" for="level-file">Or open a level file</label>
    <input
      id="level-file"
      type="file"
      accept=".txt,.clonedash,text/plain"
      disabled={busy}
      onchange={readFile}
    />
    {#if busy}<p role="status">Checking level…</p>{/if}
    {#if preview}
      <section class="import-preview" aria-label="Level preview">
        <h3>{preview.name || "Untitled trail"}</h3>
        <p>
          {preview.length} × {preview.height ?? 7} blocks · {preview.objects
            .length} pieces<br />♪ {trackFor(preview.song!).name}
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
  .import-preview {
    border-top: 1px solid var(--line);
    margin-top: 16px;
  }
  .failed {
    color: var(--warn);
  }
</style>
