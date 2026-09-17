// IDs 0–108 belong to shipped originals and saved levels. Never recycle them.
export const RECORDINGS = [
  { id: 109, name: "0 to 100", file: "zero-to-100" },
  { id: 110, name: "Cruiser", file: "cruiser" },
  { id: 111, name: "Departing At Dawn", file: "departing-at-dawn" },
  { id: 112, name: "Focus", file: "focus" },
  { id: 113, name: "Force Field", file: "force-field" },
  { id: 114, name: "No Time", file: "no-time" },
  { id: 115, name: "Time Flies", file: "time-flies" },
  { id: 116, name: "Walrus", file: "walrus" },
  { id: 117, name: "Wraghstep [v2]", file: "wraghstep" },
] as const;
export const recordingFor = (id: number) =>
  RECORDINGS.find((song) => song.id === id);
