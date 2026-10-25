import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWeight, validDay } from '../src/domain.js';
import { chartGeometry, dayTime } from '../public/chart.js';

test('Gewichte: Komma/Punkt, eine Nachkommastelle und exakte Zehntel', () => {
  for (const [value, expected] of [['78,4', 784], ['78.4', 784], ['78', 780], [' 100,1 ', 1001], ['10,0', 100], ['500,0', 5000]]) {
    assert.equal(parseWeight(value), expected);
  }
  for (const value of ['', '78,45', '7,8', '500,1', '-78', '1e2', 'Infinity', '<script>', null, 78.4]) {
    assert.throws(() => parseWeight(value));
  }
});
test('Datum: echte Kalendertage, Schaltjahre und Zeitzonengrenze', () => {
  const now = new Date('2026-10-25T23:00:00Z');
  assert.equal(validDay('2024-02-29', now), true);
  assert.equal(validDay('2026-02-29', now), false);
  assert.equal(validDay('2026-04-31', now), false);
  assert.equal(validDay('2026-10-26', now), true);
  assert.equal(validDay('2026-10-27', now), false);
  assert.equal(validDay('2026-1-1', now), false);
  assert.equal(validDay('1999-12-31', now), false);
});
test('X-Achse: 01.12., 06.12. und 03.03. haben proportionale zeitliche Abstände', () => {
  const { points } = chartGeometry([
    { day: '2026-12-01', weight: 80 }, { day: '2026-12-06', weight: 79.9 }, { day: '2027-03-03', weight: 79.7 },
  ]);
  const firstGap = points[1].x - points[0].x;
  const secondGap = points[2].x - points[1].x;
  assert.ok(Math.abs(secondGap / firstGap - 87 / 5) < 1e-10);
});
test('Zeitachse bleibt an Sommerzeitgrenzen gleichmäßig', () => {
  const days = ['2026-03-28', '2026-03-29', '2026-03-30'];
  assert.equal(dayTime(days[1]) - dayTime(days[0]), 86400000);
  const { points } = chartGeometry(days.map(day => ({ day, weight: 79 })));
  assert.equal(points[1].x - points[0].x, points[2].x - points[1].x);
});
test('Y-Achse zeigt kleine Schwankungen mit Rand und sinnvollem Minimalbereich', () => {
  const chart = chartGeometry([{ day: '2026-01-01', weight: 79.3 }, { day: '2026-01-02', weight: 79.7 }]);
  assert.ok(chart.minY < 79.3 && chart.maxY > 79.7);
  assert.ok(chart.maxY - chart.minY >= 2 && chart.maxY - chart.minY < 5);
  assert.ok(chart.points.every(p => p.y > chart.top && p.y < chart.bottom));
});
test('Ein einzelner Wert hat eine endliche, zentrierte Position', () => {
  const chart = chartGeometry([{ day: '2026-01-01', weight: 79.3 }], 320);
  assert.ok(Number.isFinite(chart.points[0].x) && Number.isFinite(chart.points[0].y));
  assert.equal(chart.points[0].x, (chart.left + chart.width - chart.right) / 2);
  assert.equal(chart.labels.length, 1);
});
