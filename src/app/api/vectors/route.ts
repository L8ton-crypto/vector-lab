import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const collectionId = req.nextUrl.searchParams.get("collectionId");
    if (!collectionId) return NextResponse.json({ error: "collectionId required" }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);
    
    // Fetch embeddings for visualisation - return raw vectors
    const docs = await sql`
      SELECT id, content, chunk_index, embedding::text
      FROM vl_documents
      WHERE collection_id = ${collectionId}
        AND embedding IS NOT NULL
      ORDER BY chunk_index ASC
    `;

    // Parse vector strings back to arrays
    const parsed = docs.map((d: Record<string, unknown>) => ({
      id: d.id,
      content: d.content,
      chunkIndex: d.chunk_index,
      embedding: (d.embedding as string).slice(1, -1).split(",").map(Number),
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch vectors" }, { status: 500 });
  }
}
