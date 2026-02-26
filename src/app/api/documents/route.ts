import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const collectionId = req.nextUrl.searchParams.get("collectionId");
    if (!collectionId) return NextResponse.json({ error: "collectionId required" }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);
    const docs = await sql`
      SELECT id, collection_id, content, chunk_index, created_at,
             CASE WHEN embedding IS NOT NULL THEN true ELSE false END as has_embedding
      FROM vl_documents 
      WHERE collection_id = ${collectionId}
      ORDER BY chunk_index ASC
    `;
    return NextResponse.json(docs);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { collectionId, chunks } = await req.json();
    if (!collectionId || !chunks?.length) {
      return NextResponse.json({ error: "collectionId and chunks required" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const results = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const { content, embedding } = chunks[i];
      const embeddingStr = embedding ? `[${embedding.join(",")}]` : null;
      
      const [doc] = await sql`
        INSERT INTO vl_documents (collection_id, content, chunk_index, embedding)
        VALUES (${collectionId}, ${content}, ${i}, ${embeddingStr}::vector)
        RETURNING id, collection_id, content, chunk_index, created_at
      `;
      results.push(doc);
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to add documents" }, { status: 500 });
  }
}
