import keytar from "keytar";

const SERVICE = "LastSunCoder";
const ACCOUNT = "openai";

export async function setOpenAIKey(apiKey: string): Promise<void> {
  if (!apiKey || apiKey.trim().length < 10) {
    throw new Error("API key inválida.");
  }
  await keytar.setPassword(SERVICE, ACCOUNT, apiKey.trim());
}

export async function getOpenAIKey(): Promise<string | null> {
  return keytar.getPassword(SERVICE, ACCOUNT);
}

export async function deleteOpenAIKey(): Promise<void> {
  await keytar.deletePassword(SERVICE, ACCOUNT);
}