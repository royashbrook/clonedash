# soundtrack

Fourteen recordings from **Of Far Different Nature, LOOP BOX #2 and #4**, are redistributed under **CC BY 4.0**, not under the game's MIT licence. The artist's release explicitly offers the pack for games. No commercial recordings or unofficial remixes are included.

- Artist: https://fardifferent.bandcamp.com/ (the artist's own attribution link; the old carrd page answers 404 as of 2026-10-02)
- Source and attribution: https://opengameart.org/node/116122 (#2), https://opengameart.org/node/116648 (#4)
- Licence: https://creativecommons.org/licenses/by/4.0/
- Download: https://opengameart.org/sites/default/files/of_far_different_nature_-_loop_pack_2_cc-by_-_ogg_files_0.zip
- Download SHA-256: `7a85d6f4fb441f999cdade92ba77a23cddf1c0688b799da6fa93699960cb06a3` (retrieved 2026-09-17, re-checked 2026-10-02).
- LOOP BOX #4 download: https://opengameart.org/sites/default/files/of_far_different_nature_-_loop_box_4_cc-by_-_ogg_files.zip
- LOOP BOX #4 SHA-256: `5b714a21b7f3c6674cdf63f9f8ded8b5b405dc090a7d61959a3a3d0fd61641c9` (retrieved 2026-10-02).
- Player-visible attribution: About → Songs and music credits (`public/music/credits.html`).

Included from #2: 0 to 100, Cruiser, Departing At Dawn, Focus, Force Field, No Time, Time Flies, Walrus, Wraghstep [v2], EZDNB2. From #4: Intervals [v2], Summer House [v2], Bouncer [v2], Vengeance Electro [v2]. The last five give each remix trail its own song (2026-10-02): Shapeshifter Intervals, Quick Change EZDNB2, Ring Road Summer House, Block Party Bouncer, Grand Finale Vengeance Electro.

The release's Ogg recordings were converted with ffmpeg to 96 kbps stereo 44.1 kHz MP3, source metadata removed and gain multiplied by 0.72. The generated encoder tag remains. No excerpting or rearranging. The game repeats the full track when a course outlasts it. The fourteen MP3s total about 11 MB (the release test caps them at 12 MiB; it was 8 MiB for nine) and are precached with the game for offline playback. One decoded track is retained at a time to bound mobile memory. A failed fetch/decode falls back to an original composition without blocking gameplay.

Soundtrack IDs 0–108 remain the shipped originals, including each custom level's `8 + id` default. Recordings use 109–122. Adding recordings must never change old custom melodies. Each new course declares its song explicitly; copies and shared levels preserve that ID.

Courses are not claimed to be fully beat-synchronized. The original engine advances at 5 blocks/sec regardless of a recording's tempo. The music is a soundtrack, not the collision clock.
