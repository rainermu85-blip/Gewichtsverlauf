import { drawChart, dayTime } from './chart.js';
import { listEntries, saveEntry, deleteEntry, parseBackup, importEntries } from './storage.js';

const $ = selector => document.querySelector(selector);
const state = { entries: [], range: 'all', view: 'entry', busy: false };
const weightFormat = weight => weight.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateFormat = (day, long = false) => new Date(dayTime(day)).toLocaleDateString('de-DE', { timeZone: 'UTC', day: '2-digit', month: long ? 'long' : '2-digit', year: 'numeric' });
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
window.addEventListener('appinstalled', () => { $('#install').hidden = true; installPrompt = null; });
$('#install').hidden = matchMedia('(display-mode: standalone)').matches;
$('#install').addEventListener('click', async () => {
  if (installPrompt) { await installPrompt.prompt(); installPrompt = null; }
  else $('#install-dialog').showModal();
});
$('#close-install').addEventListener('click', () => $('#install-dialog').close());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

function showError(error, selector = '#global-error') {
  const target = $(selector);
  target.textContent = error.message;
  target.hidden = false;
}
function clearErrors() { $('#global-error').hidden = true; $('#form-error').hidden = true; }
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4000);
}
function confirm(title, message, action) {
  const dialog = $('#confirm-dialog');
  $('#confirm-title').textContent = title; $('#confirm-text').textContent = message; $('#confirm-button').textContent = action;
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.returnValue = 'cancel'; dialog.showModal();
  });
}
function setView(view, { focus = false } = {}) {
  state.view = view;
  $('#entry-view').hidden = view !== 'entry'; $('#history-view').hidden = view !== 'history';
  for (const name of ['entry', 'history']) {
    const tab = $(`#tab-${name}`);
    tab.classList.toggle('active', name === view);
    if (name === view) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
  }
  history.replaceState(null, '', view === 'history' ? '#verlauf' : location.pathname);
  if (view === 'history') renderChart();
  if (focus) {
    if (view === 'entry') $('#weight').focus();
    else { $('#history-heading').tabIndex = -1; $('#history-heading').focus({ preventScroll: true }); }
  }
}
function existingNote() {
  const existing = state.entries.find(entry => entry.day === $('#day').value);
  $('#existing-note').hidden = !existing;
  if (existing) $('#existing-note').textContent = `Für diesen Tag sind bereits ${weightFormat(existing.weight)} kg gespeichert. Du kannst den Eintrag ersetzen.`;
}
function newEntry() {
  clearErrors(); $('#day').value = today(); $('#day').max = today(); $('#weight').value = '';
  existingNote(); setView('entry', { focus: true });
}
$('#tab-entry').addEventListener('click', () => { if (!state.busy) setView('entry'); });
$('#tab-history').addEventListener('click', () => { if (!state.busy) setView('history'); });
$('#show-history').addEventListener('click', () => setView('history', { focus: true }));
$('#new-entry').addEventListener('click', newEntry);
$('#first-entry').addEventListener('click', newEntry);
$('#day').addEventListener('change', existingNote);

$('#weight-form').addEventListener('submit', async event => {
  event.preventDefault(); clearErrors();
  if (state.busy) return;
  const weight = $('#weight').value.trim();
  const day = $('#day').value;
  const number = Number(weight.replace(',', '.'));
  if (!/^\d{1,3}([.,]\d)?$/.test(weight) || number < 10 || number > 500) {
    showError(new Error('Bitte gib ein Gewicht zwischen 10,0 und 500,0 kg mit höchstens einer Nachkommastelle ein.'), '#form-error'); $('#weight').focus(); return;
  }
  if (!day || !$('#day').validity.valid || day > today()) {
    showError(new Error('Bitte wähle ein gültiges Datum bis einschließlich heute.'), '#form-error'); $('#day').focus(); return;
  }
  state.busy = true;
  try {
    const previous = state.entries.find(entry => entry.day === day);
    if (previous && !await confirm('Eintrag ersetzen?', `Am ${dateFormat(day)} sind ${weightFormat(previous.weight)} kg gespeichert. Möchtest du diesen Wert durch ${weightFormat(number)} kg ersetzen?`, 'Ersetzen')) return;
    $('#save').disabled = true; $('#save').textContent = 'Wird gespeichert …';
    const entry = await saveEntry(day, weight);
    state.entries = [...state.entries.filter(item => item.day !== day), entry].sort((a, b) => a.day.localeCompare(b.day));
    render(); setView('history', { focus: true }); window.scrollTo({ top: 0, behavior: 'instant' }); toast('Dein Gewicht wurde gespeichert.');
  } catch (error) { showError(error, '#form-error'); }
  finally { state.busy = false; $('#save').disabled = false; $('#save').textContent = 'Eintrag speichern →'; }
});

function renderChart() {
  const cutoff = dayTime(today()) - (Number(state.range) - 1) * 86400000;
  const filtered = state.range === 'all' ? state.entries : state.entries.filter(entry => dayTime(entry.day) >= cutoff);
  drawChart($('#chart'), filtered);
}
for (const button of document.querySelectorAll('[data-range]')) {
  button.addEventListener('click', () => {
    state.range = button.dataset.range;
    for (const item of document.querySelectorAll('[data-range]')) {
      item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button));
    }
    renderChart();
  });
}
new ResizeObserver(() => { if (state.view === 'history' && state.entries.length) renderChart(); }).observe($('#chart'));
function render() {
  const entries = state.entries;
  $('#count').textContent = entries.length; $('#list-count').textContent = entries.length;
  $('#latest-strip').hidden = !entries.length; $('#empty-state').hidden = !!entries.length; $('#history-content').hidden = !entries.length;
  existingNote();
  if (!entries.length) return;
  const last = entries.at(-1), first = entries[0];
  $('#last-weight').textContent = `${weightFormat(last.weight)} kg`; $('#last-date').textContent = dateFormat(last.day);
  $('#stat-current').textContent = `${weightFormat(last.weight)} kg`; $('#stat-date').textContent = dateFormat(last.day, true);
  const difference = Math.round((last.weight - first.weight) * 10) / 10;
  $('#stat-change').textContent = `${difference > 0 ? '+' : ''}${weightFormat(difference)} kg`;
  $('#stat-start').textContent = `Seit ${dateFormat(first.day)}`; $('#stat-count').textContent = entries.length;
  const rows = entries.toReversed().map(entry => {
    const row = document.createElement('tr');
    const date = document.createElement('td'); date.textContent = dateFormat(entry.day);
    const weight = document.createElement('td'); weight.textContent = `${weightFormat(entry.weight)} kg`;
    const actions = document.createElement('td');
    const edit = document.createElement('button'); edit.className = 'row-action'; edit.textContent = 'Ändern'; edit.setAttribute('aria-label', `Eintrag vom ${dateFormat(entry.day)} ändern`);
    edit.addEventListener('click', () => {
      if (state.busy) return;
      clearErrors(); $('#day').value = entry.day; $('#weight').value = weightFormat(entry.weight); existingNote(); setView('entry', { focus: true }); window.scrollTo({ top: 0, behavior: 'instant' });
    });
    const remove = document.createElement('button'); remove.className = 'row-action delete'; remove.textContent = 'Löschen'; remove.setAttribute('aria-label', `Eintrag vom ${dateFormat(entry.day)} löschen`);
    remove.addEventListener('click', async () => {
      if (state.busy) return;
      state.busy = true; clearErrors();
      try {
        if (!await confirm('Eintrag löschen?', `Möchtest du den Eintrag vom ${dateFormat(entry.day)} mit ${weightFormat(entry.weight)} kg endgültig löschen?`, 'Löschen')) return;
        remove.disabled = true;
        await deleteEntry(entry.day);
        state.entries = state.entries.filter(item => item.day !== entry.day); render(); toast('Der Eintrag wurde gelöscht.');
      } catch (error) { showError(error); }
      finally { state.busy = false; remove.disabled = false; }
    });
    actions.append(edit, remove); row.append(date, weight, actions); return row;
  });
  $('#entries').replaceChildren(...rows);
  if (state.view === 'history') renderChart();
}
$('#export').addEventListener('click', () => {
  const text = '\uFEFFDatum;Gewicht (kg)\r\n' + state.entries.map(entry => `${entry.day};${weightFormat(entry.weight)}`).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `gewichtsverlauf-${today()}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
async function start() {
  $('#today-label').textContent = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#day').value = today(); $('#day').max = today();
  try {
    state.entries = await listEntries();
    await updateStorageStatus();
    render(); $('#loading').hidden = true; setView(location.hash === '#verlauf' ? 'history' : 'entry');
  } catch (error) {
    $('#loading').hidden = true; showError(error);
    const retry = document.createElement('button'); retry.className = 'button quiet'; retry.textContent = 'Erneut laden';
    retry.addEventListener('click', () => location.reload()); $('#global-error').append(document.createElement('br'), retry);
  }
}

async function updateStorageStatus() {
  let persistent = false;
  try { persistent = await navigator.storage?.persisted?.() || false; } catch {}
  $('#storage-status').textContent = persistent
    ? 'Der Browser schützt deinen lokalen Speicher vor automatischem Aufräumen.'
    : 'Deine Einträge liegen in einer lokalen Datenbank auf diesem Gerät. Lade regelmäßig eine Sicherung herunter.';
  $('#persist').hidden = persistent || !navigator.storage?.persist;
}
$('#persist').addEventListener('click', async () => {
  try {
    const granted = await navigator.storage.persist();
    await updateStorageStatus();
    toast(granted ? 'Dauerhafte Speicherung wurde bestätigt.' : 'Der Browser hat den Speicherschutz noch nicht zugesichert. Eine Sicherung bleibt empfehlenswert.');
  } catch (error) { showError(error); }
});
function download(text, type, filename) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#backup').addEventListener('click', async () => {
  try {
    const entries = await listEntries();
    download(JSON.stringify({ format: 'gewichtsverlauf', version: 1, entries: entries.map(({ day, weight }) => ({ day, weight })) }, null, 2),
      'application/json', `gewichtsverlauf-sicherung-${today()}.json`);
  } catch (error) { showError(error); }
});
$('#restore').addEventListener('click', () => $('#backup-file').click());
$('#backup-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file || state.busy) return;
  state.busy = true; clearErrors();
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('Diese Datei ist zu groß. Bitte wähle eine Sicherung dieser App.');
    const rows = parseBackup(await file.text());
    if (!rows.length) throw new Error('Diese Sicherung enthält keine Einträge.');
    if (!await confirm('Sicherung laden?', `${rows.length} Einträge werden auf diesem Gerät gespeichert. Neue Tage werden ergänzt; für Tage aus der Sicherung werden vorhandene Werte ersetzt.`, 'Sicherung laden')) return;
    await importEntries(rows); state.entries = await listEntries(); render(); setView('history'); toast('Die Sicherung wurde wiederhergestellt.');
  } catch (error) { showError(error); }
  finally { state.busy = false; }
});
// Another tab may have saved a value. Reload the database when returning here.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && !state.busy) {
    try { state.entries = await listEntries(); render(); } catch (error) { showError(error); }
  }
});

start();
