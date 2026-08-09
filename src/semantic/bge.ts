import { CAPABILITY_CARDS } from "../composition/catalog";

export const DEFAULT_BGE_MODEL = "bge-m3";
export const DEFAULT_BGE_ENDPOINT = "http://127.0.0.1:11434";

export interface CapabilityRetrieval {
  source: "lexical" | "bge";
  capabilityIds: string[];
  scores: Record<string, number>;
}

export interface BgeRetrievalOptions {
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  limit?: number;
  fetcher?: typeof fetch;
}

const retrievalCache = new Map<string, CapabilityRetrieval>();
const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("en-US");

function promptTokens(prompt: string): string[] {
  const normalized = normalize(prompt);
  const latin = normalized.match(/[a-z0-9-]{2,}/g) ?? [];
  const cjk = [...normalized.matchAll(/[\p{Script=Han}]{2,}/gu)].flatMap((match) => {
    const word = match[0]; const pairs: string[] = [word];
    for (let index = 0; index < word.length - 1; index += 1) pairs.push(word.slice(index, index + 2));
    return pairs;
  });
  return [...new Set([...latin, ...cjk])];
}

/** Fast deterministic fallback used when the embedding server is unavailable. */
export function retrieveCapabilitiesLexically(prompt: string, limit = 6): CapabilityRetrieval {
  const text = normalize(prompt); const tokens = promptTokens(prompt);
  const ranked = CAPABILITY_CARDS.map((card) => {
    const haystack = normalize(`${card.label} ${card.description} ${card.tags.join(" ")}`);
    let score = 0;
    for (const token of tokens) if (haystack.includes(token) || text.includes(token) && card.tags.some((tag) => normalize(tag).includes(token))) score += token.length >= 4 ? 2 : 1;
    for (const tag of card.tags) if (text.includes(normalize(tag))) score += 3;
    return { id: card.id, score };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
  return { source: "lexical", capabilityIds: ranked.map((entry) => entry.id), scores: Object.fromEntries(ranked.map((entry) => [entry.id, entry.score])) };
}

function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return -1;
  let dot = 0; let aa = 0; let bb = 0;
  for (let index = 0; index < a.length; index += 1) { const av = a[index] ?? 0; const bv = b[index] ?? 0; dot += av * bv; aa += av * av; bb += bv * bv; }
  return aa > 0 && bb > 0 ? dot / Math.sqrt(aa * bb) : -1;
}

function parseEmbeddings(value: unknown, expected: number): number[][] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const embeddings = (value as { embeddings?: unknown }).embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== expected) return undefined;
  const parsed = embeddings.map((row) => Array.isArray(row) && row.every((item) => typeof item === "number" && Number.isFinite(item)) ? row as number[] : undefined);
  return parsed.every((row): row is number[] => row !== undefined) ? parsed : undefined;
}

/**
 * BGE only retrieves bounded capability cards. It never creates coordinates or
 * geometry and failure always falls back to deterministic lexical retrieval.
 */
export async function retrieveCapabilitiesWithBge(prompt: string, options: BgeRetrievalOptions = {}): Promise<CapabilityRetrieval> {
  const fallback = retrieveCapabilitiesLexically(prompt, options.limit ?? 6);
  const key = `${options.model ?? DEFAULT_BGE_MODEL}|${normalize(prompt)}`;
  const cached = retrievalCache.get(key); if (cached) return cached;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 2_800);
  try {
    const cards = CAPABILITY_CARDS.map((card) => `${card.label}. ${card.description}. tags: ${card.tags.join(", ")}`);
    const response = await (options.fetcher ?? fetch)(`${(options.endpoint ?? DEFAULT_BGE_ENDPOINT).replace(/\/$/, "")}/api/embed`, { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ model: options.model ?? DEFAULT_BGE_MODEL, input: [prompt.slice(0, 800), ...cards], truncate: true }) });
    if (!response.ok) return fallback;
    const parsed = parseEmbeddings(await response.json(), cards.length + 1); if (!parsed) return fallback;
    const query = parsed[0]!;
    const ranked = CAPABILITY_CARDS.map((card, index) => {
      const maturityPenalty = card.status === "planned" ? 0.035 : card.status === "prototype" ? 0.015 : 0;
      return { id: card.id, score: cosine(query, parsed[index + 1]!) - maturityPenalty };
    }).filter((entry) => entry.score >= 0.28).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, options.limit ?? 6);
    const result: CapabilityRetrieval = ranked.length > 0 ? { source: "bge", capabilityIds: ranked.map((entry) => entry.id), scores: Object.fromEntries(ranked.map((entry) => [entry.id, Number(entry.score.toFixed(4))])) } : fallback;
    retrievalCache.set(key, result); if (retrievalCache.size > 48) retrievalCache.delete(retrievalCache.keys().next().value ?? key);
    return result;
  } catch { return fallback; } finally { clearTimeout(timeout); }
}
