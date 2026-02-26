import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { collectionId, embedding, topK = 5 } = await req.json();
    if (!collectionId || !embedding) {
      return NextResponse.json({ error: "collectionId and embedding required" }, { status: 400 });
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
