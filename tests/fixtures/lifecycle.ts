// Built only into a disposable test directory. No debug controls enter the shipped app.
import { mount, unmount } from "svelte";
import App from "../../src/App.svelte";
import "../../src/app.css";
let app: ReturnType<typeof mount> | undefined;
Object.assign(window, {
  mountGame() {
    if (app) throw Error("Already mounted");
    app = mount(App, { target: document.querySelector("#app")! });
  },
  async unmountGame() {
    if (app) await unmount(app);
    app = undefined;
  },
});
