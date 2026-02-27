// Generate embeddings for the Appian functions collection using Xenova/transformers
const { pipeline } = require('@xenova/transformers');
const { neon } = require('@neondatabase/serverless');

const DB_URL = 'postgresql://neondb_owner:npg_HRLp6F7oICcn@ep-rough-glade-ailx0054-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function run() {
  const sql = neon(DB_URL);
  
  // Load the model
  console.log('Loading embedding model (first run downloads ~30MB)...');
  const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
  console.log('Model loaded');

  // Get all docs without embeddings from the Appian collection
  const docs = await sql`
    SELECT id, content FROM vl_documents 
    WHERE embedding IS NULL 
    ORDER BY chunk_index ASC
  `;
  
  console.log(`${docs.length} documents need embeddings`);

  let done = 0;
  for (const doc of docs) {
    const output = await pipe(doc.content, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data);
    const embeddingStr = `[${embedding.join(',')}]`;
    
    await sql`UPDATE vl_documents SET embedding = ${embeddingStr}::vector WHERE id = ${doc.id}`;
    
    done++;
    if (done % 25 === 0) console.log(`Embedded ${done}/${docs.length}`);
  }

  console.log(`Done! ${done} embeddings generated and stored`);
}

run().catch(console.error);
