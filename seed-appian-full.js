// Seed ALL AppianCheat content into VectorLab (direct DB)
// Functions + Function Recipes + Query Recipes + Connected Systems + Patterns

const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const crypto = require('crypto');

const DB_URL = 'postgresql://neondb_owner:npg_HRLp6F7oICcn@ep-rough-glade-ailx0054-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';
const COLLECTION_ID = '7b86ae30-54ea-40bb-a7ca-df5340b9e683';
const APPIAN_DIR = 'C:\\Users\\L8\\clawd\\appian-cheat';

function parseAllFunctions(src) {
  // Find the functions array boundaries
  const start = src.indexOf('export const functions');
  const arrayStart = src.indexOf('[', start);
  
  // Find each { name: "..." block within the functions array
  const results = [];
  const blockRegex = /\{\s*\n\s*name:\s*"([^"]+)"/g;
  blockRegex.lastIndex = arrayStart;
  
  let match;
  while ((match = blockRegex.exec(src)) !== null) {
    // Stop if we've passed the functions array (hit next export)
    const nextExport = src.indexOf('export const recipes', arrayStart);
    if (match.index > nextExport) break;
    
    const name = match[1];
    // Extract the full block from this { to the next },
    const blockStart = match.index;
    let depth = 0;
    let blockEnd = blockStart;
    for (let i = blockStart; i < src.length; i++) {
      if (src[i] === '{') depth++;
      if (src[i] === '}') { depth--; if (depth === 0) { blockEnd = i + 1; break; } }
    }
    const block = src.substring(blockStart, blockEnd);
    
    const syntax = (block.match(/syntax:\s*"([^"]*)"/) || [])[1] || '';
    const desc = (block.match(/description:\s*"([^"]*)"/) || [])[1] || '';
    const category = (block.match(/category:\s*"([^"]*)"/) || [])[1] || '';
    // Example can be single-quoted, double-quoted, or backtick
    const example = (block.match(/example:\s*['"`]([^'"`]*?)['"`]/) || [])[1] || '';
    
    results.push({ name, syntax, desc, category, example });
  }
  return results;
}

function parseRecipes(src, varName) {
  const start = src.indexOf(`export const ${varName}`);
  if (start === -1) return [];
  
  // Find the closing ];
  let depth = 0, arrayStart = -1;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '[' && arrayStart === -1) { arrayStart = i; depth = 1; }
    else if (src[i] === '[') depth++;
    else if (src[i] === ']') {
      depth--;
      if (depth === 0) {
        const section = src.substring(arrayStart, i + 1);
        const results = [];
        // Match each recipe block
        const titleMatches = [...section.matchAll(/title:\s*"([^"]+)"/g)];
        for (const tm of titleMatches) {
          // Get the block containing this title
          const blockStart = section.lastIndexOf('{', tm.index);
          let bd = 0, blockEnd = blockStart;
          for (let j = blockStart; j < section.length; j++) {
            if (section[j] === '{') bd++;
            if (section[j] === '}') { bd--; if (bd === 0) { blockEnd = j + 1; break; } }
          }
          const block = section.substring(blockStart, blockEnd);
          const title = tm[1];
          const desc = (block.match(/description:\s*"([^"]*)"/) || [])[1] || '';
          const code = (block.match(/code:\s*`([\s\S]*?)`/) || [])[1] || '';
          const cat = (block.match(/category:\s*"([^"]*)"/) || [])[1] || '';
          results.push({ title, desc, code, category: cat });
        }
        return results;
      }
    }
  }
  return [];
}

function parseConnectedSystems(src) {
  const start = src.indexOf('export const connectedSystems');
  if (start === -1) return [];
  
  const results = [];
  // Find each name: block
  const nameMatches = [...src.substring(start).matchAll(/\{\s*\n\s*name:\s*"([^"]+)"[\s\S]*?category:\s*"([^"]+)"/g)];
  for (const m of nameMatches) {
    const block = m[0];
    const name = m[1];
    const cat = m[2];
    const desc = (block.match(/description:\s*"([^"]*)"/) || [])[1] || '';
    const authMatch = block.match(/authTypes:\s*\[([\s\S]*?)\]/);
    const auths = authMatch ? [...authMatch[1].matchAll(/"([^"]+)"/g)].map(a => a[1]).join(', ') : '';
    results.push({ name, desc, category: cat, auths });
  }
  return results;
}

async function run() {
  const sql = neon(DB_URL);
  const src = fs.readFileSync(`${APPIAN_DIR}\\lib\\data.ts`, 'utf8');
  const patterns = JSON.parse(fs.readFileSync(`${APPIAN_DIR}\\patterns-data.json`, 'utf8'));

  // 1. Functions
  const functions = parseAllFunctions(src);
  const fnChunks = functions.map(fn => {
    let c = `[Function] ${fn.name} (${fn.category})\nSyntax: ${fn.syntax}\nDescription: ${fn.desc}`;
    if (fn.example) c += `\nExample: ${fn.example}`;
    return c;
  });
  console.log(`Functions: ${fnChunks.length}`);

  // 2. Function Recipes
  const recipes = parseRecipes(src, 'recipes');
  const recipeChunks = recipes.map(r => {
    let c = `[Function Recipe] ${r.title}`;
    if (r.category) c += ` (${r.category})`;
    c += `\nDescription: ${r.desc}`;
    if (r.code) c += `\nCode:\n${r.code}`;
    return c;
  });
  console.log(`Function Recipes: ${recipeChunks.length}`);

  // 3. Query Recipes
  const qrRecords = parseRecipes(src, 'queryRecipesRecords');
  const qrEntity = parseRecipes(src, 'queryRecipesEntity');
  const queryChunks = [
    ...qrRecords.map(r => `[Query Recipe - Records] ${r.title}\nDescription: ${r.desc}\nCode:\n${r.code}`),
    ...qrEntity.map(r => `[Query Recipe - Entity] ${r.title}\nDescription: ${r.desc}\nCode:\n${r.code}`),
  ];
  console.log(`Query Recipes: ${queryChunks.length} (${qrRecords.length} records + ${qrEntity.length} entity)`);

  // 4. Connected Systems
  const cs = parseConnectedSystems(src);
  const csChunks = cs.map(c => {
    let content = `[Connected System] ${c.name} (${c.category})\nDescription: ${c.desc}`;
    if (c.auths) content += `\nAuth Types: ${c.auths}`;
    return content;
  });
  console.log(`Connected Systems: ${csChunks.length}`);

  // 5. Errors
  const errorsFile = fs.readFileSync(`${APPIAN_DIR}\\lib\\errors.ts`, 'utf8');
  const errorChunks = [];
  const errorBlocks = [...errorsFile.matchAll(/\{\s*\n\s*id:\s*"([^"]+)"[\s\S]*?tags:\s*\[[\s\S]*?\],?\s*\}/g)];
  for (const block of errorBlocks) {
    const id = (block[0].match(/id:\s*"([^"]+)"/) || [])[1];
    const msg = (block[0].match(/message:\s*"([^"]+)"/) || [])[1];
    const cat = (block[0].match(/category:\s*"([^"]+)"/) || [])[1];
    const cause = (block[0].match(/cause:\s*"([^"]+)"/) || [])[1];
    const fix = (block[0].match(/fix:\s*"([^"]+)"/) || [])[1];
    if (!id || !msg) continue;
    let content = `[Error ${id}] ${msg} (${cat || 'General'})`;
    if (cause) content += `\nCause: ${cause}`;
    if (fix) content += `\nFix: ${fix}`;
    errorChunks.push(content);
  }
  console.log(`Errors: ${errorChunks.length}`);

  // 6. Patterns
  const patChunks = patterns.map(p => {
    let c = `[${p.type === 'pattern' ? 'Pattern' : 'Anti-Pattern'}] ${p.title} (${p.category})`;
    c += `\nProblem: ${p.problem}`;
    c += `\nSolution: ${p.solution}`;
    if (p.example) c += `\nExample:\n${p.example}`;
    if (p.why) c += `\nWhy: ${p.why}`;
    if (p.tags && p.tags.length) c += `\nTags: ${p.tags.join(', ')}`;
    return c;
  });
  console.log(`Patterns: ${patChunks.length}`);

  // Combine
  const allChunks = [...fnChunks, ...recipeChunks, ...queryChunks, ...csChunks, ...errorChunks, ...patChunks];
  console.log(`\nTotal: ${allChunks.length} chunks`);

  // Clear & reseed
  console.log('\nDeleting existing docs...');
  await sql`DELETE FROM vl_documents WHERE collection_id = ${COLLECTION_ID}`;
  console.log('Cleared.');

  await sql`UPDATE vl_collections SET name = 'Appian Complete Reference', description = ${`Complete Appian reference: ${fnChunks.length} functions, ${recipeChunks.length} function recipes, ${queryChunks.length} query recipes, ${csChunks.length} connected systems, ${errorChunks.length} error references, ${patChunks.length} patterns & anti-patterns.`} WHERE id = ${COLLECTION_ID}`;

  console.log('Inserting...');
  for (let i = 0; i < allChunks.length; i++) {
    await sql`INSERT INTO vl_documents (id, collection_id, content, chunk_index) VALUES (${crypto.randomUUID()}, ${COLLECTION_ID}, ${allChunks[i]}, ${i})`;
    if ((i + 1) % 50 === 0 || i === allChunks.length - 1) {
      console.log(`  ${i + 1}/${allChunks.length}`);
    }
  }

  console.log(`\nDone! Inserted ${allChunks.length} chunks (embeddings cleared).`);
  console.log('Now run: node gen-embeddings.js');
}

run().catch(console.error);
