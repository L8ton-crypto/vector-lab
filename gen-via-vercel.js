// Generate embeddings by calling the deployed Vercel app's /api/embed endpoint
const { neon } = require('@neondatabase/serverless');

const DB_URL = 'postgresql://neondb_owner:npg_HRLp6F7oICcn@ep-rough-glade-ailx0054-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';
const BASE = 'https://vector-lab-gold.vercel.app';

async function run() {
  const sql = neon(DB_URL);
  const docs = await sql`SELECT id, content FROM vl_documents WHERE collection_id = '7b86ae30-54ea-40bb-a7ca-df5340b9e683' AND embedding IS NULL ORDER BY chunk_index ASC`;
  console.log(`${docs.length} docs need embeddings`);
  if (docs.length === 0) return console.log('All done!');

  const BATCH = 32;
  let done = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    const texts = batch.map(d => d.content);
    
    const res = await fetch(`${BASE}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`Embed failed: ${res.status} ${err}`);
      return;
    }
    const { embeddings } = await res.json();
    
    for (let j = 0; j < batch.length; j++) {
      const vecStr = `[${embeddings[j].join(',')}]`;
      await sql`UPDATE vl_documents SET embedding = ${vecStr}::vector WHERE id = ${batch[j].id}`;
    }
    done += batch.length;
    console.log(`Embedded ${done}/${docs.length}`);
  }
  console.log('Done!');
}

run().catch(console.error);
