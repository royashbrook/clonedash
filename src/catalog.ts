import data from "./content.generated.json" with { type: "json" };
import type { Level } from "./types.ts";
import type { Loop } from "./loop.ts";
import type { Skin } from "./skin.ts";
import type { Arrangement } from "./arrangement.ts";

// The build reads the original submissions with the same validators as in-game imports.
export const catalog = data as { levels: Level[]; skins: Skin[]; loops: Loop[]; songs: Arrangement[] };
