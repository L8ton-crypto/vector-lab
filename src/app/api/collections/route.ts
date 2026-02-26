import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const collections = await sql`
      SELECT c.*, COUNT(d.id)::int as doc_count 
      FROM vl_collections c 
      LEFT JOIN vl_documents d ON d.collection_id = c.id 
      GROUP BY c.id 
      ORDER BY c.created_at DESC
    `;
    return NextResponse.json(collections);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch collections" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, description, chunkSize, chunkOverlap } = await req.json();
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
    
    const sql = neon(process.env.DATABASE_URL!);
    const [collection] = await sql`
      INSERT INTO vl_collections (name, description, chunk_size, chunk_overlap)
      VALUES (${name}, ${description || ""}, ${chunkSize || 200}, ${chunkOverlap || 50})
      RETURNING *
    `;
    return NextResponse.json(collection);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create collection" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    
    const sql = neon(process.env.DATABASE_URL!);
    await sql`DELETE FROM vl_collections WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete collection" }, { status: 500 });
  }
}
