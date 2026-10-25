export const dayTime = day => Date.parse(`${day}T00:00:00Z`);

export function chartGeometry(entries, width = 900) {
  const height = width < 500 ? 274 : 302;
  const left = 43, right = 19, top = 24, bottom = height - 37;
  const times = entries.map(entry => dayTime(entry.day));
  const weights = entries.map(entry => entry.weight);
  const low = Math.min(...weights), high = Math.max(...weights);
  const span = Math.max(2, high - low);
  const center = (low + high) / 2;
  const paddedLow = center - span * .65;
  const paddedHigh = center + span * .65;
  const roughStep = (paddedHigh - paddedLow) / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = [1, 2, 2.5, 5, 10].map(n => n * magnitude).find(n => n >= roughStep);
  const minY = Math.max(0, Math.floor(paddedLow / step) * step);
  const maxY = Math.ceil(paddedHigh / step) * step;
  const minT = times[0], maxT = times.at(-1);
  const points = entries.map((entry, index) => ({
    ...entry,
    x: maxT === minT ? (left + width - right) / 2 : left + (times[index] - minT) / (maxT - minT) * (width - left - right),
    y: bottom - (entry.weight - minY) / (maxY - minY) * (bottom - top),
  }));
  const ticks = [];
  for (let value = minY; value <= maxY + step / 10; value += step) {
    ticks.push({ value, y: bottom - (value - minY) / (maxY - minY) * (bottom - top) });
  }
  // Pick labels only from days with entries; space them according to their real timestamps.
  const maxLabels = width < 500 ? 3 : 6;
  const minGap = width < 500 ? 76 : 105;
  const labels = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (labels.length < maxLabels - 1 && points[i].x - labels.at(-1).x >= minGap
      && points.at(-1).x - points[i].x >= minGap) labels.push(points[i]);
  }
  if (points.length > 1 && points.at(-1).x - labels.at(-1).x >= minGap) labels.push(points.at(-1));
  return { width, height, left, right, top, bottom, points, ticks, labels, minY, maxY };
}

const ns = 'http://www.w3.org/2000/svg';
function node(tag, attributes = {}, text) {
  const element = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}
const formatWeight = value => value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const formatDate = (day, options) => new Date(dayTime(day)).toLocaleDateString('de-DE', { timeZone: 'UTC', ...options });

export function drawChart(container, entries) {
  container.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'chart-empty';
    empty.textContent = 'In diesem Zeitraum gibt es noch keine Einträge.';
    container.append(empty);
    return;
  }
  const geometry = chartGeometry(entries, Math.max(280, container.clientWidth));
  const { width, height, left, right, top, bottom, points, ticks, labels } = geometry;
  const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': 'Gewicht über die Zeit. Alle Werte stehen auch in der Tabelle unterhalb.' });
  const defs = node('defs');
  const gradient = node('linearGradient', { id: 'area-gradient', x1: '0', y1: '0', x2: '0', y2: '1' });
  gradient.append(node('stop', { offset: '0%', 'stop-color': '#8faa79', 'stop-opacity': '.22' }), node('stop', { offset: '100%', 'stop-color': '#8faa79', 'stop-opacity': '.015' }));
  defs.append(gradient); svg.append(defs);
  for (const tick of ticks) {
    svg.append(node('line', { x1: left, x2: width - right, y1: tick.y, y2: tick.y, class: 'grid-line' }));
    svg.append(node('text', { x: left - 10, y: tick.y + 4, 'text-anchor': 'end' }, formatWeight(tick.value)));
  }
  const spansYears = entries[0].day.slice(0, 4) !== entries.at(-1).day.slice(0, 4);
  for (const label of labels) {
    svg.append(node('text', { x: label.x, y: height - 12, 'text-anchor': 'middle' },
      formatDate(label.day, { day: '2-digit', month: '2-digit', ...(spansYears ? { year: '2-digit' } : {}) })));
  }
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  if (points.length > 1) {
    svg.append(node('path', { d: `${path} L${points.at(-1).x},${bottom} L${points[0].x},${bottom} Z`, class: 'area' }));
    svg.append(node('path', { d: path, class: 'line' }));
  }
  const tooltip = node('g', { class: 'point-tooltip', visibility: 'hidden', 'aria-hidden': 'true' });
  tooltip.append(node('rect', { width: 158, height: 33, rx: 7 }));
  const tooltipText = node('text', { x: 79, y: 21, 'text-anchor': 'middle' });
  tooltip.append(tooltipText);
  for (const point of points) {
    const group = node('g');
    const label = `${formatDate(point.day, { day: 'numeric', month: 'long', year: 'numeric' })}: ${formatWeight(point.weight)} Kilogramm`;
    const hit = node('circle', { cx: point.x, cy: point.y, r: 13, class: 'hit-point', tabindex: 0, role: 'img', 'aria-label': label });
    const circle = node('circle', { cx: point.x, cy: point.y, r: points.length > 100 ? 2.5 : 4, class: 'point', 'pointer-events': 'none' });
    hit.append(node('title', {}, label));
    const show = () => {
      tooltip.setAttribute('transform', `translate(${Math.max(1, Math.min(width - 159, point.x - 79))},${Math.max(top - 17, point.y - 46)})`);
      tooltipText.textContent = `${formatDate(point.day, { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${formatWeight(point.weight)} kg`;
      tooltip.setAttribute('visibility', 'visible');
    };
    const hide = () => tooltip.setAttribute('visibility', 'hidden');
    hit.addEventListener('pointerenter', show); hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', show); hit.addEventListener('blur', hide);
    hit.addEventListener('click', show);
    group.append(hit, circle); svg.append(group);
  }
  svg.append(tooltip); container.append(svg);
}
