export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export type JsonObject = { [k: string]: JsonValue };
export type JsonArray = JsonValue[];
export type UnknownRecord = Record<string, unknown>;

export const isRecord = (v: unknown): v is UnknownRecord => typeof v === "object" && v !== null;

export const has = <K extends string>(o: UnknownRecord, k: K): o is UnknownRecord & Record<K, unknown> =>
  Object.prototype.hasOwnProperty.call(o, k);

// Domain DTOs
export type Project = {
  id: number;
  root: string;
  name?: string | null;
  prefs_json?: JsonValue | null;
  created_at?: number;
  updated_at?: number;
};

export type FileRecord = {
  id: number;
  project_id: number;
  path: string;
  lang?: string | null;
  hash?: string | null;
  size?: number | null;
  mtime?: number | null;
  created_at?: number;
  updated_at?: number;
};

export type SymbolRecord = {
  id: number;
  project_id: number;
  file_id: number;
  kind: string;
  name: string;
  start_line: number;
  end_line: number;
  signature?: string | null;
  created_at?: number;
};

export type Chunk = {
  fileId: number;
  path: string;
  start: number;
  end: number;
  text: string;
  meta?: UnknownRecord;
};

export type MigrationDB = {
  exec?: (sql: string) => void;
  run?: (sql: string, ...a: unknown[]) => unknown;
  prepare?: (sql: string) => { all?: () => unknown[]; run?: (sql: string, ...a: unknown[]) => unknown } | undefined;
};
