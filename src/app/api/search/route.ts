import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";

// Cache the pipeline in module scope (persists across warm invocations)
let pipelineInstance: unknown = null;
let pipelinePromise: Promise<unknown> | null = null;

async function getPipeline() {
  if (pipelineInstance) return pipelineInstance;
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = (async () => {
    const { pipeline } = await import("@xenova/transformers");
    pipelineInstance = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      quantized: true,
    });
    return pipelineInstance;
  })();

  return pipelinePromise;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const pipe = (await getPipeline()) as (
    text: string,
    opts: Record<string, unknown>
  ) => Promise<{ data: Float32Array }>;
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

export const maxDuration = 60; // Allow up to 60s for cold start model download

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { collectionId, topK = 5 } = body;

    if (!collectionId) {
      return NextResponse.json({ error: "collectionId required" }, { status: 400 });
    }

    let embedding: number[];

    // Support both: pre-computed embedding OR text query
    if (body.embedding && Array.isArray(body.embedding)) {
      embedding = body.embedding;
    } else if (body.query && typeof body.query === "string") {
      embedding = await generateEmbedding(body.query);
    } else {
      return NextResponse.json(
        { error: "Either 'embedding' array or 'query' string required" },
        { status: 400 }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);
    const embeddingStr = `[${embedding.join(",")}]`;

    const results = await sql`
      SELECT id, content, chunk_index,
             1 - (embedding <=> ${embeddingStr}::vector) as similarity
      FROM vl_documents
      WHERE collection_id = ${collectionId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${topK}
    `;

    return NextResponse.json(results);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
