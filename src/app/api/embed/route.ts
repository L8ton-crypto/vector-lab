import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const HF_URL =
  "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction";

function hfHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.HF_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.HF_TOKEN}`;
  }
  return headers;
}

async function embedSingle(text: string): Promise<number[]> {
  const res = await fetch(HF_URL, {
    method: "POST",
    headers: hfHeaders(),
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HF API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return Array.isArray(data[0]) ? data[0] : data;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  // HF Inference API supports batch input
  const res = await fetch(HF_URL, {
    method: "POST",
    headers: hfHeaders(),
    body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HF API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  // For batch input, returns [[...], [...], ...]
  return data;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { texts } = body;

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json(
        { error: "'texts' array required" },
        { status: 400 }
      );
    }

    // Process in batches of 32 to stay within HF limits
    const BATCH_SIZE = 32;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      if (batch.length === 1) {
        allEmbeddings.push(await embedSingle(batch[0]));
      } else {
        const batchResult = await embedBatch(batch);
        allEmbeddings.push(...batchResult);
      }
    }

    return NextResponse.json({ embeddings: allEmbeddings });
  } catch (error) {
    console.error("Embed error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Embedding failed" },
      { status: 500 }
    );
  }
}
