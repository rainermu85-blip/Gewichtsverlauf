import { parseWeight, validDay } from './data.js';

const name = `gewichtsverlauf:${new URL('.', import.meta.url).pathname}`;
let database;
function storageError(error) {
  return new Error(error?.name === 'QuotaExceededError'
    ? 'Der Gerätespeicher ist voll. Bitte schaffe etwas Platz und versuche es erneut.'
    : 'Der lokale Speicher ist gerade nicht verfügbar. Bitte verwende ein normales Browserfenster und erlaube Websitedaten.');
}
function open() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('entries', { keyPath: 'day' });
    request.onerror = () => { database = undefined; reject(storageError(request.error)); };
    request.onblocked = () => reject(new Error('Bitte schließe andere Fenster dieser App und lade sie erneut.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
  });
  return database;
}
async function transaction(mode, operation) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(storageError(tx.error));
    operation(tx.objectStore('entries'), value => { result = value; });
  });
}
export async function listEntries() {
  const rows = await transaction('readonly', (store, done) => {
    const request = store.getAll(); request.onsuccess = () => done(request.result);
  });
  return rows.map(row => ({ day: row.day, weight: row.weightTenths / 10, updatedAt: row.updatedAt }));
}
export async function saveEntry(day, weight) {
  if (!validDay(day)) throw new Error('Bitte wähle ein gültiges Datum.');
  const weightTenths = parseWeight(weight);
  const updatedAt = Date.now();
  await transaction('readwrite', store => store.put({ day, weightTenths, updatedAt }));
  return { day, weight: weightTenths / 10, updatedAt };
}
export function deleteEntry(day) {
  return transaction('readwrite', store => store.delete(day));
}
export function parseBackup(text) {
  let backup;
  try { backup = JSON.parse(text); }
  catch { throw new Error('Diese Datei ist keine gültige Sicherung.'); }
  if (backup?.format !== 'gewichtsverlauf' || backup.version !== 1 || !Array.isArray(backup.entries)
    || backup.entries.length > 20000) throw new Error('Diese Sicherung hat ein unbekanntes Format.');
  const seen = new Set();
  return backup.entries.map(entry => {
    if (!entry || !validDay(entry.day) || typeof entry.weight !== 'number' || seen.has(entry.day)) {
      throw new Error('Die Sicherung enthält ungültige oder doppelte Einträge. Es wurde nichts geändert.');
    }
    const weightTenths = parseWeight(String(entry.weight));
    seen.add(entry.day);
    return { day: entry.day, weightTenths, updatedAt: Date.now() };
  });
}
export async function importEntries(rows) {
  // One transaction: either every validated entry is committed, or none is.
  await transaction('readwrite', store => { for (const row of rows) store.put(row); });
}
