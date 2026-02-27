import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

async function getEmbeddingFromHF(text: string): Promise<number[]> {
  const res = await fetch(
    "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HF API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  // HF returns [[...embedding...]] for single input
  return Array.isArray(data[0]) ? data[0] : data;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { collectionId, topK = 5 } = body;

    if (!collectionId) {
      return NextResponse.json({ error: "collectionId required" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    let embedding: number[];

    if (body.embedding && Array.isArray(body.embedding)) {
      embedding = body.embedding;
    } else if (body.query && typeof body.query === "string") {
      embedding = await getEmbeddingFromHF(body.query);
    } else {
      return NextResponse.json(
        { error: "Either 'embedding' array or 'query' string required" },
        { status: 400 }
      );
    }

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
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
