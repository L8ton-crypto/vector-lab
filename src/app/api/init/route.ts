import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const sql = neon(process.env.DATABASE_URL!);

    await sql`CREATE EXTENSION IF NOT EXISTS vector`;

    await sql`
      CREATE TABLE IF NOT EXISTS vl_collections (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        chunk_size INT DEFAULT 200,
        chunk_overlap INT DEFAULT 50,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS vl_documents (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        collection_id TEXT NOT NULL REFERENCES vl_collections(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        chunk_index INT DEFAULT 0,
        embedding vector(384),
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_vl_documents_collection ON vl_documents(collection_id)
    `;

    return NextResponse.json({ success: true, message: "Tables created" });
  } catch (error) {
    console.error("Init error:", error);
    return NextResponse.json({ error: "Init failed" }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
