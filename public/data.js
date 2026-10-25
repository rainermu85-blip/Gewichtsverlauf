export function parseWeight(value) {
  if (typeof value !== 'string' || !/^\d{1,3}(?:[.,]\d)?$/.test(value.trim())) {
    throw new Error('Bitte gib dein Gewicht mit höchstens einer Nachkommastelle ein, z. B. 78,4.');
  }
  const tenths = Math.round(Number(value.trim().replace(',', '.')) * 10);
  if (tenths < 100 || tenths > 5000) throw new Error('Bitte gib ein Gewicht zwischen 10,0 und 500,0 kg ein.');
  return tenths;
}
export function validDay(day, now = new Date()) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < '2000-01-01') return false;
  const date = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== day) return false;
  return day <= new Date(now.valueOf() + 86400000).toISOString().slice(0, 10);
}
