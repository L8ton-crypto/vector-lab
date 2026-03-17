const { neon } = require('@neondatabase/serverless');

const DB_URL = 'postgresql://neondb_owner:npg_HRLp6F7oICcn@ep-rough-glade-ailx0054-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';
const HF_URL = 'https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5';
const HF_TOKEN = process.env.HF_TOKEN;

async function embedBatch(texts) {
  const headers = { 'Content-Type': 'application/json' };
  if (HF_TOKEN) headers['Authorization'] = `Bearer ${HF_TOKEN}`;
  
  const res = await fetch(HF_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
  });
  if (!res.ok) throw new Error(`HF error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function run() {
  const sql = neon(DB_URL);
  const docs = await sql`SELECT id, content FROM vl_documents WHERE collection_id = '7b86ae30-54ea-40bb-a7ca-df5340b9e683' AND embedding IS NULL ORDER BY chunk_index ASC`;
  console.log(`${docs.length} docs need embeddings`);
  
  const BATCH = 32;
  let done = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    const texts = batch.map(d => d.content);
    const embeddings = await embedBatch(texts);
    
    for (let j = 0; j < batch.length; j++) {
      const vec = Array.isArray(embeddings[j]) ? embeddings[j] : embeddings;
      const vecStr = `[${vec.join(',')}]`;
      await sql`UPDATE vl_documents SET embedding = ${vecStr}::vector WHERE id = ${batch[j].id}`;
    }
    done += batch.length;
    console.log(`Embedded ${done}/${docs.length}`);
  }
  console.log('Done!');
}

run().catch(console.error);
