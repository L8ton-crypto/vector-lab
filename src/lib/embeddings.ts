// Browser-side embedding generation using Transformers.js
// Uses all-MiniLM-L6-v2 (384 dimensions) - runs entirely client-side

let pipeline: unknown = null;
let loading = false;
let loadPromise: Promise<unknown> | null = null;

export async function getEmbeddingPipeline() {
  if (pipeline) return pipeline;
  if (loadPromise) return loadPromise;

  loading = true;
  loadPromise = (async () => {
    const { pipeline: createPipeline } = await import("@xenova/transformers");
    pipeline = await createPipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      quantized: true,
    });
    loading = false;
    return pipeline;
  })();

  return loadPromise;
}

export function isModelLoading() {
  return loading;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline() as (text: string, opts: Record<string, unknown>) => Promise<{ data: Float32Array }>;
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await generateEmbedding(text));
  }
  return results;
}

export function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let i = 0;
  
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk.trim()) chunks.push(chunk.trim());
    i += chunkSize - overlap;
    if (i >= words.length) break;
  }

  if (chunks.length === 0 && text.trim()) {
    chunks.push(text.trim());
  }

  return chunks;
}
