import fetch from 'node-fetch';

const token = 'sbp_29caa5933945a7a5f5741544ba68409d1c23a77c';

async function main() {
  const res = await fetch('https://api.supabase.com/v1/projects', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
