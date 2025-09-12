let keytar: typeof import("keytar") | undefined;
try {
  keytar = await import("keytar");
} catch {
  keytar = undefined;
}

const SERVICE = "LastSunCoder";
const ACCOUNT = "OPENAI_API_KEY";

export async function getOpenAIKey(): Promise<string | null> {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
    return process.env.OPENAI_API_KEY.trim();
  }
  if (keytar) {
    return (await keytar.getPassword(SERVICE, ACCOUNT)) ?? null;
  }
  return null;
}

export async function setOpenAIKey(key: string): Promise<void> {
  if (!keytar) throw new Error("keytar-not-available");
  await keytar.setPassword(SERVICE, ACCOUNT, key);
}

export async function clearOpenAIKey(): Promise<void> {
  if (keytar) await keytar.deletePassword(SERVICE, ACCOUNT);
}
