// Load Appian functions from AppianCheat into VectorLab
// Each function becomes one chunk with name, syntax, description, example and category

const BASE = 'https://vector-lab-gold.vercel.app';

async function run() {
  // Step 1: Read the Appian data file and extract functions
  const fs = require('fs');
  const data = fs.readFileSync('C:\\Users\\L8\\clawd\\appian-cheat\\lib\\data.ts', 'utf8');
  
  // Parse functions from the TypeScript file
  const fnRegex = /\{\s*name:\s*"([^"]+)",\s*syntax:\s*"([^"]*)",\s*description:\s*"([^"]*)"(?:,\s*example:\s*['"]([^'"]*?)['"])?(?:,\s*category:\s*"([^"]*)")?/g;
  
  const functions = [];
  let match;
  while ((match = fnRegex.exec(data)) !== null) {
    functions.push({
      name: match[1],
      syntax: match[2],
      description: match[3],
      example: match[4] || '',
      category: match[5] || '',
    });
  }
  
  console.log(`Found ${functions.length} functions`);
  
  if (functions.length === 0) {
    console.log('No functions found, check regex');
    return;
  }

  // Step 2: Create collection
  const colRes = await fetch(`${BASE}/api/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Appian Functions (250+)',
      description: 'Complete Appian function reference - 22 categories including Array, Date & Time, Logical, Looping, Records, Interface Components and more. Search naturally to find the right function.',
      chunkSize: 500,
      chunkOverlap: 0,
    }),
  });
  const collection = await colRes.json();
  console.log('Created collection:', collection.id);

  // Step 3: Format functions as rich text chunks
  const chunks = functions.map(fn => {
    let content = `${fn.name} (${fn.category})`;
    content += `\nSyntax: ${fn.syntax}`;
    content += `\nDescription: ${fn.description}`;
    if (fn.example) content += `\nExample: ${fn.example}`;
    return { content };
  });

  // Step 4: Upload in batches of 25
  const batchSize = 25;
  let uploaded = 0;
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const res = await fetch(`${BASE}/api/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collectionId: collection.id,
        chunks: batch,
      }),
    });
    
    if (!res.ok) {
      console.error('Failed batch:', await res.text());
      continue;
    }
    
    uploaded += batch.length;
    console.log(`Uploaded ${uploaded}/${chunks.length}`);
  }

  console.log(`\nDone! ${uploaded} functions loaded into VectorLab`);
  console.log(`Collection ID: ${collection.id}`);
  console.log('Visit the app and click "Generate Embeddings" to enable semantic search');
}

run().catch(console.error);
