const { pipeline } = require('@xenova/transformers');
const { neon } = require('@neondatabase/serverless');

const DB_URL = 'postgresql://neondb_owner:npg_HRLp6F7oICcn@ep-rough-glade-ailx0054-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function search(query) {
  const sql = neon(DB_URL);
  const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
  
  const output = await pipe(query, { pooling: 'mean', normalize: true });
  const embedding = Array.from(output.data);
  const embStr = `[${embedding.join(',')}]`;
  
  const results = await sql`
    SELECT content, 1 - (embedding <=> ${embStr}::vector) as similarity
    FROM vl_documents
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${embStr}::vector
    LIMIT 5
  `;
  
  console.log(`\nQuery: "${query}"\n`);
  results.forEach((r, i) => {
    console.log(`${i+1}. [${(r.similarity * 100).toFixed(1)}%] ${r.content.split('\n')[0]}`);
  });
}

(async () => {
  await search('loop through a list of items');
  await search('convert text to a date');
  await search('send an email notification');
  await search('check if user has permission');
})();
