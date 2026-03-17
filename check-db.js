const { neon } = require('@neondatabase/serverless');
const sql = neon('postgresql://neondb_owner:npg_HRLp6F7oICcn@ep-rough-glade-ailx0054-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  // Check vl_ table structures
  const vlTables = ['vl_collections', 'vl_documents'];
  for (const tbl of vlTables) {
    const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name=${tbl} ORDER BY ordinal_position`;
    console.log(`${tbl}:`, cols.map(c => `${c.column_name} (${c.data_type})`).join(', '));
  }

  // Count docs in our collection
  const docs = await sql`SELECT count(*) as c FROM vl_documents WHERE collection_id='7b86ae30-54ea-40bb-a7ca-df5340b9e683'`;
  console.log('\nDocs in Appian collection:', docs[0].c);

  // Sample a doc
  const sample = await sql`SELECT id, content, metadata FROM vl_documents WHERE collection_id='7b86ae30-54ea-40bb-a7ca-df5340b9e683' LIMIT 2`;
  sample.forEach(d => {
    console.log(`\nDoc ${d.id}:`);
    console.log('  Content:', d.content.substring(0, 100));
    console.log('  Metadata:', JSON.stringify(d.metadata));
  });
}

main().catch(console.error);
