export type ProjectPrefs = {
  whitelist?: string[];
};

export type ProjectRow = {
  id: number;
  name: string;
  root: string;
  prefs_json: string | null;
};
