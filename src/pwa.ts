/** What a check found: a newer build is out, this is the newest, or the server could not say. */
export type UpdateCheck = "newer" | "current" | "unreachable";
/** Download a complete worker before consent replaces the current controller. */
export function updateControl(ready: () => void) {
  const lifetime = new AbortController();
  let disposed = false;
  function identify() {
    navigator.serviceWorker?.controller?.postMessage({
      type: "CLIENT_BUILD",
      build: __BUILD_ID__,
    });
  }
  const registration =
    "serviceWorker" in navigator
      ? navigator.serviceWorker
          .register("/sw.js", { updateViaCache: "none" })
          .catch(() => undefined)
      : Promise.resolve(undefined);
  void registration.then((reg) => {
    if (!reg || disposed) return;
    // The legacy updater reloads after consent. If this page is already the new build,
    // finish installing its matching worker instead of leaving the old controller behind.
    const activateCurrent = () =>
      reg.waiting?.postMessage({
        type: "ACTIVATE_CURRENT",
        build: __BUILD_ID__,
      });
    const watch = () => {
      activateCurrent();
      reg.installing?.addEventListener("statechange", activateCurrent, {
        signal: lifetime.signal,
      });
    };
    reg.addEventListener("updatefound", watch, { signal: lifetime.signal });
    watch();
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", identify, {
      signal: lifetime.signal,
    });
    identify();
  }
  async function check(): Promise<UpdateCheck> {
    identify();
    // A plain controller cancels on older Safari too, which lacks AbortSignal.any
    // and AbortSignal.timeout: a timer keeps the eight-second deadline and the
    // lifetime signal forwards disposal.
    const probe = new AbortController();
    const cancel = () => probe.abort();
    const deadline = window.setTimeout(cancel, 8000);
    if (lifetime.signal.aborted) cancel();
    else lifetime.signal.addEventListener("abort", cancel, { once: true });
    try {
      const response = await fetch("/?update-probe", {
        cache: "no-store",
        signal: probe.signal,
      });
      if (!response.ok) return "unreachable";
      const doc = new DOMParser().parseFromString(
        await response.text(),
        "text/html",
      );
      const next =
        doc.querySelector<HTMLMetaElement>("meta[name=build]")?.content;
      if (!next) return "unreachable";
      if (next === __BUILD_ID__) return "current";
      if (!disposed) ready();
      return "newer";
    } catch {
      // Offline or cancellation leaves the current app intact.
      return "unreachable";
    } finally {
      clearTimeout(deadline);
      lifetime.signal.removeEventListener("abort", cancel);
    }
  }
  // Settles with the work, or rejects at the deadline or on disposal, and always
  // drops its timer and listener. The work itself is not cancelled (update() has no
  // abort): a late result just lands on a promise nobody is waiting for any more.
  function within<T>(work: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        lifetime.signal.removeEventListener("abort", cancelled);
      };
      const cancelled = () => {
        done();
        reject(Error("Update cancelled."));
      };
      const timer = window.setTimeout(() => {
        done();
        reject(Error("Update download timed out."));
      }, Math.max(0, ms));
      if (lifetime.signal.aborted) return cancelled();
      lifetime.signal.addEventListener("abort", cancelled, { once: true });
      work.then(
        (value) => {
          done();
          resolve(value);
        },
        (cause) => {
          done();
          reject(cause);
        },
      );
    });
  }
  async function apply() {
    // One 10s download budget from the tap: the registration, the script check and
    // the new worker's install all spend it. A script request that never answered
    // used to hang in update() before any timer started, with no message (#115).
    const downloadBy = Date.now() + 10000;
    const left = () => downloadBy - Date.now();
    const candidate = await within(registration, left());
    if (!candidate) throw Error("Update requires a service worker.");
    const reg: ServiceWorkerRegistration = candidate;
    await within(reg.update(), left());
    if (disposed) return;
    const waiting = await new Promise<ServiceWorker>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(Error("Update download timed out."));
      }, Math.max(0, left()));
      let installing: ServiceWorker | null = null;
      const cleanup = () => {
        clearTimeout(timer);
        reg.removeEventListener("updatefound", changed);
        installing?.removeEventListener("statechange", changed);
        lifetime.signal.removeEventListener("abort", cancelled);
      };
      const cancelled = () => {
        cleanup();
        reject(Error("Update cancelled."));
      };
      function changed() {
        if (reg.waiting) {
          const worker = reg.waiting;
          cleanup();
          resolve(worker);
          return;
        }
        if (reg.installing !== installing) {
          installing?.removeEventListener("statechange", changed);
          installing = reg.installing;
          installing?.addEventListener("statechange", changed);
        }
        if (installing?.state === "redundant") {
          cleanup();
          reject(Error("Update download failed."));
        }
      }
      reg.addEventListener("updatefound", changed);
      lifetime.signal.addEventListener("abort", cancelled, { once: true });
      changed();
    });
    if (disposed) return;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(Error("Update activation timed out."));
      }, 8000);
      const cleanup = () => {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          changed,
        );
        lifetime.signal.removeEventListener("abort", cancelled);
      };
      const changed = () => {
        cleanup();
        resolve();
      };
      const cancelled = () => {
        cleanup();
        reject(Error("Update cancelled."));
      };
      navigator.serviceWorker.addEventListener("controllerchange", changed, {
        once: true,
      });
      lifetime.signal.addEventListener("abort", cancelled, { once: true });
      waiting.postMessage({ type: "ACTIVATE" });
    });
    if (!disposed) location.reload();
  }
  const interval = window.setInterval(check, 60000);
  return {
    check,
    apply,
    dispose() {
      disposed = true;
      lifetime.abort();
      clearInterval(interval);
    },
  };
}
