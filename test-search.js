const { neon } = require('@neondatabase/serverless');
const sql = neon('postgresql://neondb_owner:npg_HRLp6F7oICcn@ep-rough-glade-ailx0054-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require');

async function search(query) {
  // Generate embedding for query
  const res = await fetch('https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.HF_TOKEN },
    body: JSON.stringify({ inputs: query, options: { wait_for_model: true } }),
  });
  const embedding = await res.json();
  const vecStr = `[${embedding.join(',')}]`;

  const results = await sql`
    SELECT content, 1 - (embedding <=> ${vecStr}::vector) as similarity 
    FROM vl_documents 
    WHERE collection_id = '7b86ae30-54ea-40bb-a7ca-df5340b9e683' AND embedding IS NOT NULL 
    ORDER BY embedding <=> ${vecStr}::vector 
    LIMIT 5
  `;
  console.log('Query: ' + query);
  console.log('---');
  for (const r of results) {
    console.log((r.similarity * 100).toFixed(1) + '% | ' + r.content.split('\n')[0]);
  }
  console.log('');
}

(async () => {
  await search('how to handle errors in expressions');
  await search('set up REST API integration');
  await search('best practice for large record queries');
})();
