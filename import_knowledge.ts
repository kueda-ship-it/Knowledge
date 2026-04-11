import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
  const content = fs.readFileSync('attached_data.csv');
  const records = parse(content, { columns: true, skip_empty_lines: true });

  const items = records.map(row => {
    let attachments;
    try {
      attachments = JSON.parse(row.attachments);
    } catch {
      attachments = [];
    }
    
    let tags = [];
    if (row.tags) {
        tags = row.tags.split(',').map((t: string) => t.trim());
    }

    let incidents = [];
    if (row.incidents) {
        incidents = row.incidents.split(',').map((t: string) => t.trim());
    }

    return {
      id: row.id,
      machine: row.machine,
      property: row.property,
      req_num: row.req_num || null,
      title: row.title,
      category: row.category,
      incidents: incidents,
      tags: tags,
      content: row.content,
      status: row.status,
      updated_at: row.updatedAt,
      author: row.author,
      attachments: attachments
    };
  });

  console.log(`Prepared ${items.length} items. Upserting to Supabase...`);
  
  const { data, error } = await supabase.from('knowledge').upsert(items);
  if (error) {
    console.error('Error inserting data:', error);
  } else {
    console.log('Successfully inserted data.');
  }
}

main().catch(console.error);
