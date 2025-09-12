import OpenAI from "openai";
import { getOpenAIKey } from "@lsc/core";

export async function runDoctor() {
  console.log(`[doctor] Node: ${process.version}`);

  const key = await getOpenAIKey();
  const apiKey = key ?? process.env.OPENAI_API_KEY ?? "";

  if (!apiKey) {
    console.log("[doctor] No API key found (Secrets/env).");
    process.exitCode = 1;
    return;
  }

  const client = new OpenAI({ apiKey });

  const t0 = Date.now();
  try {
    await client.models.list();
    const dt = Date.now() - t0;
    console.log(`[doctor] STATUS: OK (${dt} ms)`);
  } catch (err: any) {
    const name = err?.name ?? "Error";
    const status = err?.status ?? err?.code ?? "N/A";
    const msg = err?.message ?? String(err);

    if (name === "AuthenticationError" || status === 401) {
      console.log("[doctor] ERROR: 401 Unauthorized (verifique a API key).");
    } else if (name === "RateLimitError" || status === 429) {
      console.log("[doctor] ERROR: 429 Rate limit/quota atingida.");
    } else if (name === "APIConnectionError" || name === "TimeoutError") {
      console.log("[doctor] ERROR: Conexão/timeout com a API.");
    } else {
      console.log(`[doctor] ERROR: ${name} (${status}) — ${msg}`);
    }
    process.exitCode = 1;
  }
}
