import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

// Run this on your own computer. All authentication happens in the provider's
// browser/CLI; this script never reads or stores an OAuth client secret.
const root = fileURLToPath(new URL('../', import.meta.url));
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const configPath = new URL('../wrangler.json', import.meta.url);
async function ask(question) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try { return await prompt.question(question); }
  finally { prompt.close(); }
}
function command(args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], {
      cwd: root, stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    });
    let output = '';
    if (capture) child.stdout.on('data', data => { output += data; process.stdout.write(data); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(`wrangler ${args[0]} wurde beendet (${code}). Du kannst die Einrichtung erneut starten.`)));
  });
}
function jsonOutput(output) {
  const start = output.indexOf('['), end = output.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('Die Cloudflare-Antwort konnte nicht gelesen werden. Siehe docs/EINRICHTUNG.md für die manuelle Einrichtung.');
  return JSON.parse(output.slice(start, end + 1));
}
async function save(config) { await writeFile(configPath, JSON.stringify(config, null, 2) + '\n'); }
try {
  console.log('\nGewichtsverlauf einrichten\nEin Cloudflare-Konto und dein GitHub-Konto werden benötigt.\n');
  const identity = await command(['whoami'], true);
  if (/not authenticated/i.test(identity)) await command(['login']);
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const binding = config.d1_databases.find(item => item.binding === 'DB');
  if (!binding || !config.vars) throw new Error('Die Konfiguration ist unvollständig. Bitte docs/EINRICHTUNG.md lesen.');
  if (binding.database_id === '00000000-0000-0000-0000-000000000000') {
    const databases = jsonOutput(await command(['d1', 'list', '--json'], true));
    let database = databases.find(item => item.name === binding.database_name);
    if (!database) {
      await command(['d1', 'create', binding.database_name, '--location', 'weur']);
      database = jsonOutput(await command(['d1', 'list', '--json'], true)).find(item => item.name === binding.database_name);
    }
    if (!database?.uuid) throw new Error('Keine Datenbank-ID gefunden. Siehe docs/EINRICHTUNG.md.');
    binding.database_id = database.uuid;
    await save(config);
  }
  await command(['d1', 'migrations', 'apply', 'DB', '--remote']);
  // The first deployment serves a login screen; no one can create a session
  // until the GitHub OAuth configuration is complete.
  const deployment = await command(['deploy'], true);
  const deployedUrl = deployment.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/gi)?.at(-1);
  let origin = deployedUrl || config.vars.APP_ORIGIN;
  if (!origin) origin = (await ask('Website-Adresse aus der Ausgabe (https://…workers.dev): ')).trim();
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' || origin !== parsed.origin) throw new Error('Bitte eine HTTPS-Adresse ohne abschließenden Schrägstrich angeben.');
  config.vars.APP_ORIGIN = origin;
  const registration = new URL('https://github.com/settings/applications/new');
  registration.search = new URLSearchParams({
    'oauth_application[name]': 'Gewichtsverlauf',
    'oauth_application[url]': origin,
    'oauth_application[callback_url]': `${origin}/auth/callback`,
  });
  console.log(`\nGitHub-OAuth-App registrieren:\n${registration}\n\nHomepage URL: ${origin}\nAuthorization callback URL: ${origin}/auth/callback\nKeine Device-Flow-Option aktivieren.\n`);
  const clientId = (await ask(`Client ID${config.vars.GITHUB_CLIENT_ID ? ' (Enter = bisherige behalten)' : ''}: `)).trim() || config.vars.GITHUB_CLIENT_ID;
  if (!/^[\w.-]{5,100}$/.test(clientId)) throw new Error('Die Client ID fehlt oder ist ungültig.');
  config.vars.GITHUB_CLIENT_ID = clientId;
  await save(config);
  console.log('\nKlicke bei GitHub auf „Generate a new client secret“.\nGib den Client Secret gleich ausschließlich im folgenden Cloudflare-Dialog ein.\nNicht in den Chat oder die Konfigurationsdatei kopieren.\n');
  await command(['secret', 'put', 'GITHUB_CLIENT_SECRET']);
  await command(['deploy']);
  console.log(`\nFertig: ${origin}\nMelde dich dort mit ${config.vars.GITHUB_LOGIN} an.\nAuf Android: „App installieren“.\n`);
} catch (error) {
  console.error(`\nEinrichtung unterbrochen: ${error.message}`);
  process.exitCode = 1;
}
