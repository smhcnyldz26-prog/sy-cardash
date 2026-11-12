'use strict';
/*
 * tele-widgets.js - the Telemetry design of the car apps (redesign approved 2026-11-04, spec
 * docs/superpowers/specs/2026-11-04-car-apps-telemetry-redesign-design.md) as renderer elements. Same contract as
 * widgets.js: DRAW[type](cv, t, b, o) on a kit canvas / recorder (t, the kit theme, is not used: one fixed palette),
 * TRY[type](cv, b, o, p) for touch (gpu.js touchElement). No builder code: shipped to the car in renderer/ (Node 8).
 * Looks moved from the approved mock-ups (scripts/hmi-tools/redesign/tele.js, ds.js, phase2.js, features.js).
 */
const { withAlpha } = require('./kit/canvas');
const { vicon } = require('./kit/vicons');
const W = require('./widgets');
const S = require('./store-widgets');                             // the video list's geometry, scrolling and taps

// M Track: white numbers, M blue accent, M red limit. No amber, no green.
const C = {
    bg: '#000000', panel: '#0a0a0b', edge: '#1b3a55', track: '#12283c', text: '#f2f3f5', dim: '#81c4ff', faint: '#16588e',
    accent: '#81c4ff', onAccent: '#03121c', ok: '#81c4ff', warn: '#e7222e', crit: '#e7222e', info: '#81c4ff', credit: '#16588e',
};
// colours the app passes as literals (main.js gear, charts) mapped onto this palette
const MTRACK = { '#FFB020': '#f2f3f5', '#FF3B30': '#e7222e', '#7FC4FF': '#81c4ff', '#5BD68A': '#81c4ff', '#4A4F57': '#16588e' };
const T = { display: 150, big: 96, value: 64, title: 44, body: 34, sub: 27, cap: 24, credit: 22 };
const CAPS = { font: 'bold', spacing: 2 };
const CREDIT = 'Developed by IterioDev and RobertNisipeanu';
// the shell's rows inside its box (box top = the app area's top): header, hairline, page line; content starts at h
const SHELL = { id8: { pad: 40, top: 20, hair: 80, sub: 128, h: 172 }, id7: { pad: 32, top: 14, hair: 74, sub: 118, h: 154 } };

const isNum = (x) => typeof x === 'number' && isFinite(x);
const col = (c, d) => (c && C[c] ? C[c] : typeof c === 'string' && c[0] === '#'
    ? (MTRACK[c.toUpperCase()] || c) : d);   // a tele token name, '#rrggbb' (mapped), else d
const up = (s) => String(s == null ? '' : s).toUpperCase();
const dp = (d) => Math.max(0, Math.min(20, d | 0));              // decimals for toFixed (Node 8 takes 0..20 only)
const caps = (cv, s, x, y, c, o) => cv.text(up(s), x, y, (o && o.size) || T.cap, c || C.dim, Object.assign({}, CAPS, o || {}));
const capsW = (cv, s, size) => cv.textWidth(up(s), size || T.cap, CAPS);
const hair = (cv, x, y, w, c) => cv.fillRect(x, y, w, 2, c || C.edge);
const vhair = (cv, x, y, h, c) => cv.fillRect(x, y, 2, h, c || C.edge);
const split = (s, sep) => String(s || '').split(sep).map((x) => x.trim());
// "a | b | c" lines -> [[a, b, c]]; an array (from the app) as it is
const lines = (v) => (Array.isArray(v) ? v : String(v || '').split('\n').filter((l) => l.trim()).map((l) => split(l, '|')));
const items = (v) => (Array.isArray(v) ? v : split(v, ',').filter(Boolean));
const fracOf = (o) => (isNum(o.value) && o.max > o.min ? Math.max(0, Math.min(1, (o.value - o.min) / (o.max - o.min))) : 0);

function fit(cv, s, w, size, o) {                         // cut to a width, with an ellipsis
    s = String(s); if (cv.textWidth(s, size, o) <= w) return s;
    while (s.length > 1 && cv.textWidth(s + '…', size, o) > w) s = s.slice(0, -1);
    return s + '…';
}

function value(cv, x, y, v, unit, size, color, align) {        // big number + unit, y = baseline
    const uw = unit ? cv.textWidth(' ' + unit, T.sub) : 0;
    if (align === 'right') {
        cv.text(String(v), x - uw, y, size, color || C.text, { font: 'num', align: 'right' });
        if (unit) cv.text(' ' + unit, x, y, T.sub, C.dim, { align: 'right' });
    } else {
        const vw = cv.textWidth(String(v), size, { font: 'num' });
        cv.text(String(v), x, y, size, color || C.text, { font: 'num' });
        if (unit) cv.text(' ' + unit, x + vw, y, T.sub, C.dim);
    }
}
function chip(cv, xr, y, text, color) {                          // right edge xr; returns its left edge
    const w = cv.textWidth(text, T.cap) + 64, h = 46;
    cv.roundRect(xr - w, y, w, h, 4, withAlpha(color, 0.16));
    cv.circle(xr - w + 24, y + h / 2, 7, color);
    cv.text(text, xr - w + 40, y + 32, T.cap, color);
    return xr - w;
}
// "text|colour; text|colour" or [[text, colour]] -> chips from the right edge
const chipList = (v) => (Array.isArray(v) ? v : split(v, ';').filter(Boolean).map((s) => split(s, '|')));
function chips(cv, xr, y, v) { let x = xr; chipList(v).forEach(([t, c]) => { x = chip(cv, x, y, t, col(c, C.dim)) - 14; }); }
function progress(cv, x, y, w, f, left, right, color) {
    if (left) caps(cv, left, x, y, C.dim);
    if (right) cv.text(right, x + w, y, T.cap, C.text, { align: 'right', font: 'num' });
    cv.fillRect(x, y + 18, w, 12, C.track); cv.fillRect(x, y + 18, w * f, 12, color || C.accent);
}
function empty(cv, x, y, w, h, icon, head, line, color) {         // an empty or finished state, centred
    const cx = x + w / 2, cy = y + h / 2;
    if (icon) vicon(cv, icon, cx - 36, cy - 110, 72, color || C.faint);
    caps(cv, head, cx, cy + 10, color || C.text, { align: 'center', size: T.body });
    if (line) cv.text(line, cx, cy + 60, T.sub, C.dim, { align: 'center' });
}
function kv(cv, x, y, w, rows, rh) {                              // rows [[key, value, colour]] on hairlines
    rows.forEach(([k, v, c], i) => {
        const yy = y + i * rh;
        cv.text(String(k), x, yy + rh / 2 + 10, T.sub, C.dim);
        cv.text(String(v == null ? '' : v), x + w, yy + rh / 2 + 10, T.sub, col(c, C.text), { align: 'right', font: 'num' });
        hair(cv, x, yy + rh - 2, w);
    });
}
// columns "Label:share:align, ..." or [[label, share, align]]; rows [[cell or [cell, colour]]]
const colList = (v) => (Array.isArray(v) ? v : items(v).map((s) => { const p = s.split(':'); return [p[0], +p[1] || 1, p[2] || 'left']; }));
function table(cv, x, y, w, cols, rows, rh) {
    const tot = cols.reduce((a, c) => a + c[1], 0);
    let cx = x; const xs = cols.map((c) => { const s = cx; cx += w * c[1] / tot; return s; });
    const at = (i, c) => (c[2] === 'right' ? xs[i] + w * c[1] / tot : xs[i]);
    cols.forEach((c, i) => caps(cv, c[0], at(i, c), y + 30, C.dim, { align: c[2] || 'left' }));
    hair(cv, x, y + 48, w);
    rows.forEach((r, j) => {
        const yy = y + 50 + j * rh;
        cols.forEach((c, i) => {
            const v = r[i], txt = Array.isArray(v) ? v[0] : v == null ? '' : String(v), cc = Array.isArray(v) ? col(v[1], C.text) : C.text;
            cv.text(txt, at(i, c), yy + rh / 2 + 11, T.body - 4, cc, { align: c[2] || 'left', font: i ? 'num' : 'label' });
        });
        hair(cv, x, yy + rh - 2, w);
    });
}

const nums = (v) => (Array.isArray(v) ? v.map(Number) : split(v, ',').filter((x) => x !== '').map(Number));
function spark(cv, x, y, w, h, vals, lo, hi, color, fill) {
    if (vals.length < 2 || !(hi > lo)) return;
    const P = vals.map((v, i) => [x + w * i / (vals.length - 1), y + h - h * (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)]);
    if (fill) cv.fillUnder(P, y + h, withAlpha(color, 0.10));
    cv.polyline(P, 3, color);
    const e = P[P.length - 1]; cv.circle(e[0], e[1], 7, color);
}
function trend(cv, x, y, w, h, o) {                               // value with its last minutes
    hair(cv, x, y, w); caps(cv, o.label, x, y + 40, C.dim);
    value(cv, x, y + 112, o.value, o.unit, 72);
    const lg = items(o.legend);
    if (lg.length === 2) { caps(cv, lg[0], x + w, y + 40, C.accent, { align: 'right' }); caps(cv, lg[1], x + w - capsW(cv, lg[0]) - 32, y + 40, C.text, { align: 'right' }); }
    const sy = y + 132, sh = h - 132 - 44;
    hair(cv, x, sy + sh, w, '#14171c');
    spark(cv, x, sy, w, sh, nums(o.points), o.lo, o.hi, C.accent, true);
    if (o.points2) spark(cv, x, sy, w, sh, nums(o.points2), o.lo, o.hi, C.text, false);
    if (o.foot) cv.text(o.foot, x, y + h - 8, T.cap, C.dim);
}
// points [[x, y]] or "x:y, x:y"
const pairs = (v) => (Array.isArray(v) ? v : items(v).map((s) => s.split(':').map(Number)));
function chart(cv, x, y, w, h, pts, o) {
    // x from xMin (default 0) to xMax; a right-hand axis when y2Max > 0 (Drag Timer's Power run: hp left, Nm right)
    const x0 = isNum(o.xMin) ? o.xMin : 0, xr = isNum(o.xMax) ? o.xMax - x0 : NaN, two = isNum(o.y2Max) && o.y2Max > 0;
    const kx = xr > 0 ? w / xr : 0, ky = isNum(o.yMax) && o.yMax > 0 ? h / o.yMax : 0, ky2 = two ? h / o.y2Max : 0;   // 0: all on the axis
    const px = (v) => x + kx * (v - x0), py = (v, k) => y + h - (k === undefined ? ky : k) * v;
    // at most 50 ticks a side, tick i at i * step (no added-up float steps), its label rounded
    const xs = o.xStep > 0 ? Math.max(o.xStep, xr / 50) : 0, ys = o.yStep > 0 ? Math.max(o.yStep, o.yMax / 50) : 0, lbl = (v) => String(Math.round(v * 1e6) / 1e6);
    const y2s = two && o.y2Step > 0 ? Math.max(o.y2Step, o.y2Max / 50) : 0;
    for (let i = 0; isNum(ys) && ys > 0 && i * ys <= o.yMax + ys / 1e6; i++) {
        const v = i * ys; hair(cv, x, py(v), w, i ? '#14171c' : C.edge); cv.text(lbl(v), x - 12, py(v) + 8, T.cap - 2, two ? C.accent : C.faint, { align: 'right', font: 'num' });
    }
    for (let i = 0; y2s > 0 && i * y2s <= o.y2Max + y2s / 1e6; i++) cv.text(lbl(i * y2s), x + w + 12, py(i * y2s, ky2) + 8, T.cap - 2, C.text, { font: 'num' });
    for (let i = 0; isNum(xs) && xs > 0 && i * xs <= xr + xs / 1e6; i++) {
        const v = x0 + i * xs, end = Math.abs(v - o.xMax) < xs / 1e6;
        cv.text(lbl(v) + (end && o.xUnit ? ' ' + o.xUnit : ''), px(v), y + h + 32, T.cap - 2, C.faint, { align: end ? 'right' : 'center', font: 'num' });
    }
    if (o.yUnit) caps(cv, o.yUnit, x, y - 14, two ? C.accent : C.dim);
    if (two && o.y2Unit) caps(cv, o.y2Unit, x + w, y - 14, C.text, { align: 'right' });
    // the app's other lines, under the main one: [{ points, color, axis (2: the right-hand one), width, dot }]
    (Array.isArray(o.series) ? o.series : []).filter(Boolean).forEach((s) => {
        const P = pairs(s.points || []).map(([a, v]) => [px(a), py(v, s.axis === 2 ? ky2 : ky)]), c = col(s.color, C.dim);
        if (P.length >= 2) cv.polyline(P, s.width || 2, c);
        if (s.dot && P.length) cv.circle(P[P.length - 1][0], P[P.length - 1][1], 9, c);
    });
    if (pts.length < 2) return;
    const P = pts.map(([a, v]) => [px(a), py(v)]);
    cv.fillUnder(P, y + h, withAlpha(C.accent, 0.16));
    cv.polyline(P, 4, C.accent);
    const e = P[P.length - 1]; cv.circle(e[0], e[1], 9, C.accent);
}
function barTile(cv, x, y, w, h, o) {                              // label, value, flat bar with red zone and ticks
    hair(cv, x, y, w); caps(cv, o.label, x, y + 42, C.dim);
    const none = !isNum(o.value), vs = o.big || (h > 200 ? 92 : h > 160 ? 68 : 56), uw = cv.textWidth(' ' + o.unit, T.sub);
    const lim = isNum(o.limit) ? o.limit : Infinity;              // no limit (null): no red zone
    const vy = y + vs * 0.9 + 6, over = !none && o.value >= lim;
    cv.text(none ? '--' : o.value.toFixed(dp(o.dec)), x + w - uw, vy, vs, none ? C.dim : over ? C.crit : C.text, { align: 'right', font: 'num' });
    cv.text(' ' + o.unit, x + w, vy, T.sub, C.dim, { align: 'right' });
    const by = vy + 26, bh = Math.max(24, y + h - by - (o.ticks ? 50 : 24)), th = Math.min(bh, 12), ty = by + (bh - th) / 2;
    const f = (v) => (o.max > o.min ? Math.max(0, Math.min(1, (v - o.min) / (o.max - o.min))) : 0);
    cv.fillRect(x, ty, w, th, C.track);
    cv.fillRect(x + w * f(lim), ty, w * (1 - f(lim)), th, withAlpha(C.crit, 0.55));
    if (!none) { cv.fillRect(x, ty, w * f(o.value), th, over ? C.crit : C.accent); cv.fillRect(x + w * f(o.value) - 2, ty - 10, 4, th + 20, '#ffffff'); }
    if (isNum(o.peak)) cv.fillRect(x + w * f(o.peak) - 2, ty - 6, 4, th + 12, C.dim);
    for (let i = 0; o.ticks && i <= o.ticks; i++) {
        const v = o.min + (o.max - o.min) * i / o.ticks, tx = x + w * i / o.ticks;
        const s = isNum(o.tickDec) && o.tickDec >= 0 ? v.toFixed(dp(o.tickDec)) : String(Math.round(v / (o.tickDiv || 1)));
        cv.fillRect(tx - 1, by + bh + 6, 2, 10, C.faint);
        cv.text(s, tx, by + bh + 44, T.cap, v >= lim ? C.crit : C.dim, { align: i === 0 ? 'left' : i === o.ticks ? 'right' : 'center', font: 'num' });
    }
}
function miniTile(cv, x, y, w, h, o) {
    hair(cv, x, y, w); caps(cv, o.label, x, y + 44, C.dim);
    const none = !isNum(o.value);
    cv.text(none ? '--' : o.value.toFixed(dp(o.dec)), x + w - cv.textWidth(' ' + o.unit, T.cap), y + 54, 52, none ? C.dim : C.text, { align: 'right', font: 'num' });
    cv.text(' ' + o.unit, x + w, y + 54, T.cap, C.dim, { align: 'right' });
    const by = y + h - 26;
    cv.fillRect(x, by, w, 8, C.track);
    cv.fillRect(x, by, w * (none ? 0 : fracOf(o)), 8, col(o.color, C.accent));
}
function field(cv, x, y, w, h, text, label, focus, hint) {
    cv.fillRect(x, y, w, h, C.panel);
    cv.fillRect(x, y + h - 4, w, 4, focus ? C.accent : C.edge);
    if (label) caps(cv, label, x + 20, y + 32, C.dim);
    const ty = label ? y + h - 24 : y + h / 2 + 12;
    const tw = cv.text(text || hint || '', x + 20, ty, T.body, text ? C.text : C.faint);
    if (focus) cv.fillRect(x + 24 + (text ? tw : 0), ty - 32, 3, 40, C.accent);
}
function videoBox(cv, x, y, w, h, label, quad) {
    cv.fillRect(x, y, w, h, '#0d1014');
    if (quad) { vhair(cv, x + w / 2 - 1, y, h, '#000000'); cv.fillRect(x, y + h / 2 - 1, w, 2, '#000000'); }
    const labs = quad ? [['FRONT', 0, 0], ['REAR', 1, 0], ['LEFT', 0, 1], ['RIGHT', 1, 1]] : [[label == null ? 'VIDEO' : label, 0, 0]];
    labs.forEach(([t, i, j]) => {
        const cw = quad ? w / 2 : w, ch = quad ? h / 2 : h, cx = x + i * cw, cy = y + j * ch;
        if (ch < 60) return;
        const lab = !!t && ch >= 120 && cv.textWidth(up(t), T.cap, CAPS) < cw - 20, is = Math.min(56, ch * 0.4);
        vicon(cv, 'video', cx + cw / 2 - is / 2, cy + ch / 2 - (lab ? is * 0.8 : is / 2), is, C.faint);
        if (lab) caps(cv, t, cx + cw / 2, cy + ch / 2 + 44, C.faint, { align: 'center' });
    });
}

function btn(cv, x, y, w, h, text, kind, icon, off) {             // kind: primary | outline | danger | dangerOutline | quiet
    let fg = C.text;
    if (off) { cv.roundRect(x, y, w, h, 4, C.track); fg = C.faint; }
    else if (kind === 'primary') { cv.roundRect(x, y, w, h, 4, C.accent); fg = C.onAccent; }
    else if (kind === 'danger') { cv.roundRect(x, y, w, h, 4, C.crit); fg = '#ffffff'; }
    else if (kind === 'quiet') cv.roundRect(x, y, w, h, 4, C.track);
    else { cv.strokeRoundRect(x, y, w, h, 4, 2, kind === 'dangerOutline' ? withAlpha(C.crit, 0.8) : C.edge); fg = kind === 'dangerOutline' ? C.crit : C.text; }
    const size = h >= 80 ? T.sub : T.cap, tw = text ? capsW(cv, text, size) : 0, is = icon ? Math.round(h * 0.42) : 0, gap = icon && text ? 16 : 0;
    const x0 = x + (w - tw - is - gap) / 2;
    if (icon) vicon(cv, icon, x0, y + (h - is) / 2, is, fg);
    if (text) caps(cv, text, x0 + is + gap, y + h / 2 + size * 0.36, fg, { size });
}
function seg(cv, x, y, w, h, its, sel, off) {
    const n = its.length, bw = w / Math.max(1, n);
    cv.strokeRoundRect(x, y, w, h, 4, 2, C.edge);
    its.forEach((it, i) => {
        const bx = x + i * bw, size = h >= 80 ? T.sub : T.cap;
        if (i === sel) cv.roundRect(bx, y, bw, h, 4, off ? C.track : C.accent);
        else if (i && i - 1 !== sel) vhair(cv, bx, y + 14, h - 28);
        caps(cv, it, bx + bw / 2, y + h / 2 + size * 0.36, off ? (i === sel ? C.dim : C.faint) : i === sel ? C.onAccent : C.dim, { size, align: 'center' });
    });
}
const segAt = (x, w, n, px) => Math.max(0, Math.min(n - 1, Math.floor((px - x) / (w / Math.max(1, n)))));
function toggle(cv, xr, y, on, off) {                             // 116 x 62, right edge xr
    const w = 116, h = 62, X = xr - w;
    cv.roundRect(X, y, w, h, 6, on && !off ? C.accent : C.track);
    if (!on || off) cv.strokeRoundRect(X, y, w, h, 6, 2, C.faint);
    cv.roundRect(on ? X + w - 55 : X + 7, y + 7, 48, 48, 3, on && !off ? '#000000' : C.dim);
}
function sliderDraw(cv, x, cy, w, f, label, off) {                // track centred on cy, the value right of it
    const fg = off ? C.faint : C.text;
    cv.fillRect(x, cy - 4, w, 8, C.track); cv.fillRect(x, cy - 4, w * f, 8, off ? C.faint : C.accent);
    cv.roundRect(x + w * f - 6, cy - 22, 12, 44, 2, fg);
    if (label != null) cv.text(String(label), x + w + 24, cy + 11, T.sub, fg, { font: 'num' });
}
const shownValue = (o) => (o.text ? o.text : isNum(o.value) ? `${o.value.toFixed(dp(o.decimals))}${o.unit ? ' ' + o.unit : ''}` : '--');
const sliderTrack = (b, o) => ({ x: b.x, w: Math.max(0, b.w - (o.showValue === false ? 0 : 160)) });
function sliderSet(b, o, p, track) {
    const tr = track || sliderTrack(b, o), k = Math.pow(10, dp(o.decimals));
    const f = tr.w > 0 ? Math.max(0, Math.min(1, (p.x - tr.x) / tr.w)) : 0;
    o.value = Math.round((o.min + (o.max - o.min) * f) * k) / k;
}

// a row's control boxes (drawing and touch use the same): { seg | slider | toggle }
function rowParts(b, o) {
    const right = b.x + b.w - 8, sw = o.sw || Math.min(600, b.w * 0.45), slw = o.sw || Math.min(380, b.w * 0.3);
    return { toggle: { x: right - 116, y: b.y + (b.h - 62) / 2, w: 116, h: 62 },
        seg: { x: right - sw, y: b.y + (b.h - 72) / 2, w: sw, h: 72 },
        slider: { x: right - slw - 120, w: slw } };
}
function rowDraw(cv, b, o) {
    const x = b.x, y = b.y, w = b.w, h = b.h, P = rowParts(b, o);
    hair(cv, x, y + h - 2, w);
    if (o.selected) cv.fillRect(x, y + 12, 5, h - 26, C.accent);
    let tx = x + (o.selected ? 22 : 0);
    if (o.badge != null && o.badge !== '') {
        const bc = col(o.badgeColor, C.dim), bt = up(o.badge), bs = bt.length > 2 ? T.cap : 30;
        const bw = o.badgeW || Math.max(70, cv.textWidth(bt, bs, CAPS) + 28);
        cv.roundRect(tx, y + (h - 58) / 2, bw, 58, 3, withAlpha(bc, 0.2));
        cv.text(bt, tx + bw / 2, y + h / 2 + bs * 0.36, bs, bc, Object.assign({ align: 'center' }, CAPS));
        tx += bw + 28;
    }
    const off = !!o.disabled, fg = off ? C.faint : C.text;          // greyed out: every text and control faint
    if (o.icon) { vicon(cv, o.icon, tx, y + (h - 44) / 2, 44, off ? C.faint : C.accent); tx += 70; }
    const room = (o.control === 'seg' ? P.seg.x : o.control === 'slider' ? P.slider.x : o.control === 'toggle' ? P.toggle.x : x + w) - tx - 24;
    cv.text(fit(cv, o.label || '', room, T.body - 2), tx, y + (o.sub ? h / 2 - 6 : h / 2 + 12), T.body - 2, fg);
    if (o.sub) cv.text(fit(cv, o.sub, room, T.cap), tx, y + h / 2 + 32, T.cap, off ? C.faint : col(o.subColor, C.dim));
    const right = x + w - 8, c = o.control;
    if (c === 'toggle') toggle(cv, right, P.toggle.y, !!o.on, off);
    else if (c === 'value' || c === 'chevron') {
        const cw = c === 'chevron' ? 44 : 0;
        if (cw) vicon(cv, 'chevron', right - 38, y + (h - 40) / 2, 40, off ? C.faint : C.dim);
        cv.text(o.text || '', right - cw, y + h / 2 + 11, T.sub, off ? C.faint : col(o.textColor, C.dim), { align: 'right' });
    } else if (c === 'slider') {
        sliderDraw(cv, P.slider.x, y + h / 2, P.slider.w, fracOf(o), null, off);
        cv.text(shownValue(o), right, y + h / 2 + 11, T.sub, fg, { align: 'right', font: 'num' });
    } else if (c === 'seg') seg(cv, P.seg.x, P.seg.y, P.seg.w, P.seg.h, items(o.items), o.sel | 0, off);
}
function tile(cv, x, y, w, h, icon, title, sub, selected) {
    cv.fillRect(x, y, w, h, selected ? withAlpha(C.accent, 0.1) : C.panel);
    cv.strokeRoundRect(x, y, w, h, 4, 2, selected ? C.accent : C.edge);
    if (h < 170) {                                                // low tile: icon left of the text
        if (icon) vicon(cv, icon, x + 22, y + (h - 48) / 2, 48, selected ? C.accent : C.text);
        cv.text(title, x + 90, y + h / 2 - (sub ? 4 : -10), T.body - 6, C.text);
        if (sub) cv.text(sub, x + 90, y + h / 2 + 30, T.cap, C.dim);
        return;
    }
    const s = Math.min(56, h * 0.36);
    if (icon) vicon(cv, icon, x + 24, y + 22, s, selected ? C.accent : C.text);
    cv.text(title, x + 24, y + h - (sub ? 52 : 26), T.body - 6, C.text);
    if (sub) cv.text(sub, x + 24, y + h - 20, T.cap, C.dim);
}
function appTile(cv, x, y, w, h, o) {
    cv.fillRect(x, y, w, h, o.selected ? withAlpha(C.accent, 0.1) : C.panel);
    cv.strokeRoundRect(x, y, w, h, 4, 2, o.selected ? C.accent : C.edge);
    const s = Math.min(64, h - 40), sx = x + 20, sy = y + (h - s) / 2;
    const img = o.pic ? W.picture(o.pic) : null;
    if (img) cv.image(img, sx, sy, s, s, 10);
    else { cv.roundRect(sx, sy, s, s, 10, col(o.color, '#5d6d7e')); cv.text(String(o.letter || '?'), sx + s / 2, y + h / 2 + 12, 34, '#ffffff', { align: 'center', font: 'bold' }); }
    cv.text(fit(cv, o.title || '', w - s - 60, T.sub), sx + s + 20, y + h / 2 + 11, T.sub, C.text);
}

const metrics = (o) => SHELL[o.hu === 'id7' ? 'id7' : 'id8'];
// the shell's tabs: [{ x, y, w, h, label, badge }] - drawing and touch share them
function shellBoxes(cv, b, o) {
    const M = metrics(o), top = b.y + M.top, x0 = b.x + M.pad;
    const aw = cv.textWidth(up(o.app || ''), T.body, { font: 'bold', spacing: 4 });
    let x = x0 + 68 + aw + 64;
    return items(o.tabs).map((t) => {
        const [label, badge] = Array.isArray(t) ? t : split(t, '|'), tw = capsW(cv, label, T.sub);
        const box = { x: x - 20, y: top, w: tw + 40 + (badge ? 60 : 0), h: M.hair, label, badge, tx: x, tw };
        x += tw + (badge ? 60 : 0) + 60;
        return box;
    });
}
function shellDraw(cv, b, o) {
    const M = metrics(o), top = b.y + M.top, x0 = b.x + M.pad, right = b.x + b.w - M.pad;
    if (o.icon) vicon(cv, o.icon, x0, top + 4, 48, C.accent);
    cv.text(up(o.app || ''), x0 + 68, top + 44, T.body, C.text, { font: 'bold', spacing: 4 });
    shellBoxes(cv, b, o).forEach((t, i) => {
        caps(cv, t.label, t.tx, top + 42, i === (o.sel | 0) ? C.text : C.dim, { size: T.sub });
        if (t.badge) { const bx = t.tx + t.tw + 12; cv.roundRect(bx, top + 14, 40, 34, 3, withAlpha(C.crit, 0.25)); cv.text(String(t.badge), bx + 20, top + 40, T.cap, C.crit, { align: 'center', font: 'bold' }); }
        if (i === (o.sel | 0)) cv.fillRect(t.tx, top + M.hair - 9, t.tw, 4, C.crit);
    });
    if (o.chips) chips(cv, right, top + 2, o.chips);
    hair(cv, x0, top + M.hair, right - x0);
    const sb = top + M.sub;
    let sx = x0 + (o.back ? 174 : 0);                              // the Back button (a teleButton) sits in that gap
    if (o.title) { caps(cv, o.title, sx, sb, C.text, { size: T.sub }); sx += capsW(cv, o.title, T.sub) + 24; }
    if (o.sub) cv.text(o.sub, sx, sb, T.cap, C.dim);
    // credit line replaced by the SY signature element (drawn last, on top)
}
// keyboard: digits, three letter rows, the space row (Shift / Delete / Space / Go are named keys)
function keyBoxes(b) {
    const rows = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'], g = 10, kh = (b.h - g * 4) / 5, kw = (b.w - g * 9) / 10, out = [];
    rows.forEach((s, j) => {
        const ky = b.y + j * (kh + g);
        if (j < 2) [...s].forEach((ch, i) => out.push({ text: ch, x: b.x + i * (kw + g), y: ky, w: kw, h: kh }));
        else if (j === 2) [...s].forEach((ch, i) => out.push({ text: ch, x: b.x + kw / 2 + i * (kw + g), y: ky, w: kw, h: kh }));
        else {
            out.push({ text: 'Shift', kind: 'mod', x: b.x, y: ky, w: kw * 1.5 + g / 2, h: kh });
            [...s].forEach((ch, i) => out.push({ text: ch, x: b.x + kw * 1.5 + g * 1.5 + i * (kw + g), y: ky, w: kw, h: kh }));
            out.push({ text: 'Delete', kind: 'mod', x: b.x + kw * 8.5 + g * 8.5, y: ky, w: kw * 1.5 + g / 2, h: kh });
        }
    });
    const ky = b.y + 4 * (kh + g);
    out.push({ text: '-', x: b.x, y: ky, w: kw, h: kh }, { text: '.', x: b.x + kw + g, y: ky, w: kw, h: kh },
        { text: 'Space', kind: 'mod', x: b.x + (kw + g) * 2, y: ky, w: (kw + g) * 6 - g, h: kh },
        { text: 'Go', kind: 'go', x: b.x + (kw + g) * 8, y: ky, w: kw * 2 + g, h: kh });
    return out;
}
const keyText = (k, o) => (k.kind === 'go' ? o.go || 'Done' : o.shift && !k.kind && /^[a-z]$/.test(k.text) ? k.text.toUpperCase() : k.text);
function keyboard(cv, b, o) {
    keyBoxes(b).forEach((k, i) => {
        if (k.kind === 'go') cv.roundRect(k.x, k.y, k.w, k.h, 4, C.accent);
        else if (i === o.pressed) cv.roundRect(k.x, k.y, k.w, k.h, 4, C.track);
        else cv.strokeRoundRect(k.x, k.y, k.w, k.h, 4, 2, k.kind === 'mod' ? C.faint : C.edge);
        const c = k.kind === 'go' ? C.onAccent : k.kind === 'mod' ? (k.text === 'Shift' && o.shift ? C.accent : C.dim) : C.text, tx = keyText(k, o);
        if (k.kind) caps(cv, tx, k.x + k.w / 2, k.y + k.h / 2 + 9, c, { align: 'center' });
        else cv.text(tx, k.x + k.w / 2, k.y + k.h / 2 + 12, T.body - 2, c, { align: 'center' });
    });
}
// the dialog over the dimmed app area; its card and the two buttons' boxes (the generator places two teleButtons there).
// It takes every tap on its box and on the app area it dims (gpu-elements.js hitBox; iDrive 7: 84,76 1836 x 644)
function dialogLayout(area) {
    const w = Math.min(1300, area.w - 160), h = 380, x = area.x + (area.w - w) / 2, y = area.y + (area.h - h) / 2, bw = (w - 96 - 24) / 2;
    return { card: { x, y, w, h }, cancel: { x: x + 48, y: y + h - 48 - 96, w: bw, h: 96 }, ok: { x: x + 48 + bw + 24, y: y + h - 48 - 96, w: bw, h: 96 } };
}
function dialogDraw(cv, o) {
    const a = o.area || { x: 0, y: 76, w: 2880, h: 764 }, L = dialogLayout(a), k = L.card;
    cv.fillRect(a.x, a.y, a.w, a.h, withAlpha('#000000', 0.78));
    cv.fillRect(k.x, k.y, k.w, k.h, '#07080a'); cv.strokeRoundRect(k.x, k.y, k.w, k.h, 4, 2, C.edge); cv.fillRect(k.x, k.y, k.w, 5, o.danger ? C.crit : C.accent);
    caps(cv, o.title || '', k.x + 48, k.y + 80, C.text, { size: T.body });
    if (o.body) cv.text(o.body, k.x + 48, k.y + 140, T.sub, C.dim);
    if (o.body2) cv.text(o.body2, k.x + 48, k.y + 182, T.sub, C.dim);
}

const DRAW = {};
const TRY = {};

DRAW.teleValue = (cv, t, b, o) => { const right = o.align === 'right';
    value(cv, right ? b.x + b.w : b.x, b.y + o.size * 0.82, o.value, o.unit, o.size, col(o.color, C.text), right ? 'right' : 'left'); };
DRAW.teleChip = (cv, t, b, o) => chips(cv, b.x + b.w, b.y, o.items);
DRAW.teleProgress = (cv, t, b, o) => progress(cv, b.x, b.y + 24, b.w, Math.max(0, Math.min(1, +o.value || 0)), o.label, o.right, col(o.color, C.accent));
DRAW.teleEmpty = (cv, t, b, o) => empty(cv, b.x, b.y, b.w, b.h, o.icon, o.head, o.line, o.color ? col(o.color) : null);
DRAW.teleKv = (cv, t, b, o) => kv(cv, b.x, b.y, b.w, lines(o.rows), o.rowH || 60);
DRAW.teleTable = (cv, t, b, o) => table(cv, b.x, b.y, b.w, colList(o.columns), lines(o.rows), o.rowH || 72);

DRAW.teleTrend = (cv, t, b, o) => trend(cv, b.x, b.y, b.w, b.h, o);
DRAW.teleChart = (cv, t, b, o) => chart(cv, b.x + 60, b.y + 30, b.w - (isNum(o.y2Max) && o.y2Max > 0 ? 120 : 60), b.h - 70, pairs(o.points), o);
DRAW.teleBarTile = (cv, t, b, o) => barTile(cv, b.x, b.y, b.w, b.h, o);
DRAW.teleMiniTile = (cv, t, b, o) => miniTile(cv, b.x, b.y, b.w, b.h, o);
DRAW.teleField = (cv, t, b, o) => field(cv, b.x, b.y, b.w, b.h, o.text, o.label, o.focus, o.hint);
// the app's frames over the stand-in (renderer protocol 4, as the store's video element)
DRAW.teleVideo = (cv, t, b, o) => { videoBox(cv, b.x, b.y, b.w, b.h, o.text, o.quad); if (cv.video && o.show !== false && o.stream) cv.video(o.stream | 0, b.x, b.y, b.w, b.h, 0); };

DRAW.teleButton = (cv, t, b, o) => btn(cv, b.x, b.y, b.w, b.h, o.text, o.kind, o.icon, o.disabled);
DRAW.teleSeg = (cv, t, b, o) => seg(cv, b.x, b.y, b.w, b.h, items(o.items), o.sel | 0, o.disabled);
DRAW.teleToggle = (cv, t, b, o) => toggle(cv, b.x + b.w, b.y + (b.h - 62) / 2, !!o.on, o.disabled);
DRAW.teleSlider = (cv, t, b, o) => { const tr = sliderTrack(b, o); sliderDraw(cv, tr.x, b.y + b.h / 2, tr.w, fracOf(o), o.showValue === false ? null : shownValue(o), o.disabled); };

TRY.teleSeg = (cv, b, o, p) => { const n = items(o.items).length; if (!n || p.move) return false; o.sel = segAt(b.x, b.w, n, p.x); };
TRY.teleToggle = (cv, b, o, p) => { if (p.move) return false; o.on = !o.on; };
TRY.teleSlider = Object.assign((cv, b, o, p) => { sliderSet(b, o, p); }, { drag: true });

DRAW.teleRow = (cv, t, b, o) => rowDraw(cv, b, o);
DRAW.teleTile = (cv, t, b, o) => tile(cv, b.x, b.y, b.w, b.h, o.icon, o.title, o.sub, !!o.selected);
DRAW.teleAppTile = (cv, t, b, o) => appTile(cv, b.x, b.y, b.w, b.h, o);
// a list of videos (YouTube's results, Up next): the store's video list (store-widgets videoView: rows, columns, the
// first row shown; its TRY scrolls by whole rows and gives a tap as o.tap { id, part: 'video', n }) drawn as the
// Telemetry rows (redesign/phase2.js videoRow): the 16:9 picture ('key:<id>', the stand-in until it comes) with its
// duration, two lines of title, a small line, a hairline; the one playing (it.now) marked with the accent bar
DRAW.teleVideoList = (cv, t, b, o) => {
    const v = S.videoView(b, o);
    v.all.slice(v.top * v.cols, (v.top + v.n) * v.cols).forEach((it, k) => {
        const x = b.x + (k % v.cols) * (v.cw + v.gap), y = b.y + Math.floor(k / v.cols) * v.rh, th = v.rh - 20, tw = Math.round(th * 16 / 9);
        const img = it.thumb ? W.picture(it.thumb) : null;
        if (img) cv.image(img, x, y + 10, tw, th, 0); else videoBox(cv, x, y + 10, tw, th, '');
        if (it.dur) {
            const d = String(it.dur), dw = cv.textWidth(d, T.cap, { font: 'num' }) + 24;
            cv.roundRect(x + tw - 10 - dw, y + v.rh - 52, dw, 34, 3, '#000000');
            cv.text(d, x + tw - 10 - dw / 2, y + v.rh - 26, T.cap, C.text, { align: 'center', font: 'num' });
        }
        const tx = x + tw + 28, room = v.cw - tw - 28, n = W.wrap(cv, it.title, tx, y + 24, room, T.body - 4, C.text, 2);
        if (it.sub) cv.text(fit(cv, String(it.sub), room, T.cap), tx, y + 56 + Math.max(1, n) * 38, T.cap, C.dim);
        if (it.now) cv.fillRect(x - 16, y + 10, 5, th, C.accent);
        hair(cv, x, y + v.rh - 2, v.cw, '#101318');
    });
    if (v.rows > v.n) {                                           // more rows than shown: where the shown ones are
        const h = b.h * v.n / v.rows;
        cv.fillRect(b.x + b.w - 4, b.y + (b.h - h) * v.top / Math.max(1, v.rows - v.n), 4, h, C.faint);
    }
};
TRY.teleVideoList = S.TRY.videoList;

const inside = (r, p) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
// a tap flips the row's switch (anywhere on the row, as the builder's row); a seg follows the tap on it; a slider drags
// when the touch started on its slider part (o._drag, ended by the release); a tap on the label leaves it
TRY.teleRow = Object.assign((cv, b, o, p) => {
    const P = rowParts(b, o), n = items(o.items).length;
    if (o.control === 'slider') {
        const was = !!o._drag;
        if (!p.move) o._drag = p.x >= P.slider.x - 40;
        if (!o._drag) return was ? undefined : false;              // (a release that never came: drop its drag)
        sliderSet(b, o, p, P.slider); return;
    }
    if (p.move) return false;
    if (o.control === 'toggle') { o.on = !o.on; return; }
    if (o.control === 'seg' && n && inside(P.seg, p)) { o.sel = segAt(P.seg.x, P.seg.w, n, p.x); return; }
    return false;
}, { drag: true, up: (cv, b, o) => { o._drag = false; return null; } });   // null: unchanged (no extra 'change'), still a tap

DRAW.teleShell = (cv, t, b, o) => shellDraw(cv, b, o);
DRAW.teleKeyboard = (cv, t, b, o) => keyboard(cv, b, o);
DRAW.teleDialog = (cv, t, b, o) => dialogDraw(cv, o);

TRY.teleShell = (cv, b, o, p) => {
    if (p.move) return false;
    const i = shellBoxes(cv, b, o).findIndex((t) => inside(t, p));
    if (i < 0) return false;
    o.sel = i;
};
// as the store's keyboard: the key is typed at the touch (o.key = { text, n }), the release only un-presses
TRY.teleKeyboard = Object.assign((cv, b, o, p) => {
    if (p.move) return false;
    const ks = keyBoxes(b), i = ks.findIndex((k) => inside(k, p));
    if (i < 0) return false;
    const text = keyText(ks[i], o);
    if (text === 'Shift') o.shift = !o.shift;
    o.pressed = i; o.keyN = (o.keyN || 0) + 1; o.key = { text, n: o.keyN };
}, { up: (cv, b, o) => { if (o.pressed == null) return false; o.pressed = null; o.key = null; } });
TRY.teleDialog = () => false;

// ---------------------------------------------------------------------------
// M Track - Engine page drawing block (band composition).
//
//   values    #f2f3f5  white: the numbers are the hierarchy
//   accent    #81c4ff  M light blue: labels, gauge fill, shift lights
//   structure #16588e  deep blue: empty track, ticks, hairlines, credit
//   limit     #e7222e  M red: redline, over-limit, active tab
//
// No amber, no green, no card boxes. Same element names and opts the app
// already sends, so src/ stays untouched: this is presentation only.
// ---------------------------------------------------------------------------
const MT = { pad: 48, red: '#e7222e', deep: '#16588e', light: '#81c4ff' };

function mtMark(cv, x, y, h) {                                 // the three M bars
    const w = Math.max(5, Math.round(h * 0.28)), g = Math.max(3, Math.round(h * 0.18));
    [MT.light, MT.deep, MT.red].forEach((c, i) => cv.fillRect(x + i * (w + g), y, w, h, c));
}
// The backdrop: one small texture stretched to the app area. It used to be three 1024x960 tiles
// (full resolution) but that is ~12 MB of texture on a head unit with a 100 MB ceiling - the frame
// was drawn once and the renderer then died. One 1024x342 tile is 1.4 MB and scales smoothly.
const BGPIC = [];
try {
    const list = require('./kit/assets/bg.js');
    for (const it of list) {
        const w = Array.isArray(it) ? it[0] : 960;
        const src = Array.isArray(it) ? it[1] : it;
        const pic = require('./kit/png').decode(Buffer.from(String(src).split(',')[1], 'base64'));
        BGPIC.push([w, require('./kit/record').makeImage(pic.w, pic.h, pic.data)]);
    }
} catch (e) { BGPIC.length = 0; }
function mtBgDraw(cv, b, o) {
    try {
        let x = 0;
        for (const [w, pic] of BGPIC) {
            cv.image(pic, x, 0, BGPIC.length === 1 ? b.w : w, b.h, 0);
            x += w;
        }
        if (!BGPIC.length) return;
        // Perde: icerik alani sakinlesir, fotograf ust bantta ve alt seritte nefes alir.
        const veil = o && isNum(o.veil) ? o.veil : 0.5;
        const top = 140, bot = b.h - 20, ramp = 40, step = ramp / 10;
        for (let i = 0; i < 10; i++) {
            cv.fillRect(0, top - ramp + step * i, b.w, step + 1, withAlpha('#000000', veil * (i + 1) / 10));
        }
        cv.fillRect(0, top, b.w, bot - top, withAlpha('#000000', veil));
        for (let i = 0; i < 10; i++) {
            cv.fillRect(0, bot + step * i, b.w, step + 1, withAlpha('#000000', veil * (10 - i) / 10));
        }
        for (let i = 0; i < 8; i++) {
            cv.fillRect(i * 16, 0, 17, b.h, withAlpha('#000000', 0.30 * (1 - i / 8)));
            cv.fillRect(b.w - (i + 1) * 16, 0, 17, b.h, withAlpha('#000000', 0.30 * (1 - i / 8)));
        }
    } catch (e) { /* arka plan cizilemezse sayfa siyah kalir, uygulama dusmez */ }
}
// The signature: the M wordmark that sits under SY. Its own picture so the
// header never depends on a font glyph the atlas may lack.
let MLOGO = null;
try {
    const src = require('./kit/assets/m-logo.js');
    const pic = require('./kit/png').decode(Buffer.from(String(src).split(',')[1], 'base64'));
    MLOGO = require('./kit/record').makeImage(pic.w, pic.h, pic.data);
} catch (e) { MLOGO = null; }
function syMark(cv, o, b) {
    const a = o.area || { x: b.x, y: b.y, w: b.w, h: b.h }, br = o.where === 'br';
    const size = br ? 54 : 80;                                // the wordmark is the loudest thing in the header
    const ws = cv.textWidth('S', size, { font: 'sy', spacing: 3 });
    const wy = cv.textWidth('Y', size, { font: 'sy', spacing: 3 });
    const lh = br ? 44 : 40, lw = lh * (MLOGO ? MLOGO.w / MLOGO.h : 2.82);
    const right = a.x + a.w - (br ? 48 : MT.pad);
    const base = br ? a.y + a.h - 20 : a.y + 68;
    const syX = br ? right - ws - wy : right - ws - wy;
    cv.text('S', syX, base, size, C.text, { font: 'sy', spacing: 3 });
    cv.text('Y', syX + ws, base, size, C.text, { font: 'sy', spacing: 3 });
    if (MLOGO) {
        // the M mark sits on its own, bottom-right, like a badge; on old pages beside the wordmark
        if (br) cv.image(MLOGO, syX - 24 - lw, base - lh, lw, lh, 0, 1);
        else cv.image(MLOGO, a.x + (a.w - lw) / 2, a.y + a.h - lh - 24, lw, lh, 0, 1);
    }
}
// A section rule or surface. The default is a hairline only: no inset box, no
// radius, no shadow - squares read as the older iDrive tiles.
function mtPanelDraw(cv, b, o) {
    if (o.vert) { cv.fillRect(b.x, b.y, 1, b.h, withAlpha(MT.deep, o.edge == null ? 0.45 : o.edge)); return; }
    if (o.fill && o.fill !== '-') cv.fillRect(b.x, b.y, b.w, b.h, o.fill);
    if (o.line) { cv.fillRect(b.x, b.y, b.w, 1, withAlpha(MT.deep, o.edge == null ? 0.45 : o.edge)); return; }
    cv.strokeRoundRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 0, 1, withAlpha(MT.deep, o.edge == null ? 0.55 : o.edge));
    const divs = o.divs | 0;
    for (let i = 1; i < divs; i++) cv.fillRect(b.x + b.w * i / divs, b.y + 20, 1, b.h - 40, withAlpha(MT.deep, 0.4));
}
function mtTabBoxes(cv, b, o) {                                // the page rail: tabs left, within the driver's reach
    const tabs = items(o.tabs), gap = 40, base = b.y + 46;
    const widths = tabs.map((t) => capsW(cv, t, 22));
    let x = b.x + MT.pad;
    return tabs.map((t, i) => {
        const box = { x: x - 12, y: base - 26, w: widths[i] + 24, h: 38, label: t, tx: x, tw: widths[i], i };
        x += widths[i] + gap;
        return box;
    });
}
function mtShellDraw(cv, b, o) {
    const x = b.x + MT.pad, right = b.x + b.w - MT.pad, sel = o.sel | 0;
    const rEnd = right - 150;                                  // the SY wordmark owns the corner
    mtTabBoxes(cv, b, o).forEach((t) => {
        caps(cv, t.label, t.tx, b.y + 46, t.i === sel ? C.text : withAlpha(MT.light, 0.75), { size: 22 });
        if (t.i === sel) cv.fillRect(t.tx, b.y + 56, t.tw, 3, MT.red);
    });
    if (o.chips) mtChips(cv, rEnd, b.y + 38, o.chips);
    if (o.sub) cv.text(o.sub, rEnd, b.y + 74, 20, withAlpha(MT.light, 0.65), { align: 'right' });
    cv.fillRect(x, b.y + 92, right - x, 1, withAlpha(MT.deep, 0.6));   // the header rule
}
function mtRevDraw(cv, b, o) {                                 // the rev band: the screen's backbone
    const x = b.x + MT.pad, right = b.x + b.w - MT.pad;
    const v = isNum(o.value) ? o.value : null, min = isNum(o.min) ? o.min : 0, max = o.max > min ? o.max : 8000;
    const lim = isNum(o.limit) ? o.limit : max, f = (n) => Math.max(0, Math.min(1, (n - min) / (max - min)));
    caps(cv, o.label || 'Motor devri', x, b.y + 24, MT.light, { size: 22 });
    const txt = v == null ? '--' : v.toFixed(dp(o.dec));
    const nw = cv.textWidth(txt, 96, { font: 'mont' });
    // past the limit the number and the red zone flash, like a shift light on the car.
    // o.flash = its own threshold if the app ever sends one; else the red-zone start.
    const flashAt = isNum(o.flash) ? o.flash : lim;
    const over = v != null && flashAt != null && v >= flashAt;
    const blinkOn = !over || Math.floor(Date.now() / 500) % 2 === 0;
    cv.text(txt, x + nw, b.y + 122, 96, v == null ? MT.deep : over ? (blinkOn ? MT.red : C.text) : C.text, { font: 'mont', align: 'right' });
    cv.text(o.unit || 'rpm', x + nw + 14, b.y + 122, 24, over ? MT.red : MT.light);
    // the band: 40 segments, M blue to the value, red past the limit
    const lights = 10, lw = 15, lgap = 6, lightsW = lights * lw + (lights - 1) * lgap;
    const bandX = x + 340, bandW = right - bandX - lightsW - 60, by = b.y + 66, bh = 30, n = 40, gap = 3;
    const sw = (bandW - (n - 1) * gap) / n, lit = v == null ? 0 : Math.round(f(v) * n), peakN = isNum(o.peak) ? Math.round(f(o.peak) * n) : -1;
    for (let i = 0; i < n; i++) {
        const sx = bandX + i * (sw + gap), seg = min + (max - min) * (i + 0.5) / n, red = seg > lim;
        const lit1 = i < lit || (over && blinkOn && red);
        cv.fillRect(sx, by, sw, bh, lit1 ? (red ? MT.red : C.text) : red ? withAlpha(MT.red, 0.28) : C.track);
    }
    if (peakN >= 0) cv.fillRect(bandX + peakN * (sw + gap) - 1, by - 10, 3, bh + 20, MT.deep);
    // ticks under the band
    const ticks = o.ticks || 8;
    for (let i = 0; i <= ticks; i++) {
        const tx = bandX + bandW * i / ticks, tv = min + (max - min) * i / ticks;
        const label = isNum(o.tickDec) && o.tickDec >= 0 ? tv.toFixed(dp(o.tickDec)) : String(Math.round(tv / (o.tickDiv || 1)));
        cv.text(label, tx, by + bh + 34, 20, tv > lim ? withAlpha(MT.red, 0.9) : MT.deep, { align: i === 0 ? 'left' : i === ticks ? 'right' : 'center', font: 'mont' });
    }
    // shift lights, right of the band
    const sx0 = bandX + bandW + 60, on = v == null ? 0 : Math.min(lights, Math.round(f(v) / Math.max(0.01, f(lim)) * lights));
    for (let i = 0; i < lights; i++) {
        const on1 = i < on, hot = i >= lights - 3;
        const col1 = on1 ? (hot ? (over && !blinkOn ? withAlpha(MT.red, 0.3) : MT.red) : C.text) : C.track;
        cv.fillRect(sx0 + i * (lw + lgap), by + 4, lw, bh - 8, col1);
    }
}
function mtHeroDraw(cv, b, o) {                                // speed: one number, nothing else
    const v = o.value == null ? '--' : String(o.value);
    caps(cv, o.label || 'Hiz', b.x, b.y + 24, MT.light, { size: 22 });
    const size = isNum(o.size) ? o.size : Math.min(b.h * 0.78, 190);
    cv.text(v, b.x, b.y + size * 0.92 + 24, size, col(o.color, C.text), { font: 'mont' });
    const w = cv.textWidth(v, size, { font: 'mont' });
    if (o.unit) cv.text(o.unit, b.x + w + 12, b.y + size * 0.92 + 24, 24, MT.light);
}
function mtGearDraw(cv, b, o) {                                // the gear digit
    const t = o.text || '--', size = isNum(o.size) ? o.size : Math.min(b.h * 0.86, 180);
    cv.text(String(t), b.x, b.y + size * 0.92 + 24, size, col(o.color, C.text), { font: 'mont' });
}
function mtMeterDraw(cv, b, o) {                               // label, number, unit in its own column, one thin bar
    const v = isNum(o.value) ? o.value : null, min = isNum(o.min) ? o.min : 0, max = o.max > min ? o.max : 100;
    const lim = isNum(o.limit) ? o.limit : max, f = (n) => Math.max(0, Math.min(1, (n - min) / (max - min)));
    caps(cv, o.label, b.x, b.y + 22, MT.light, { size: 22 });
    const big = isNum(o.size) ? o.size : Math.min(b.h * 0.62, 96), base = b.y + 22 + big * 0.86;
    const uw = cv.textWidth(o.unit, 22) + 12;                  // the unit gets its own column
    cv.text(v == null ? '--' : v.toFixed(dp(o.dec)), b.x + b.w - uw, base, big, v == null ? MT.deep : (v >= lim ? MT.red : C.text), { align: 'right', font: 'mont' });
    cv.text(o.unit, b.x + b.w, base, 22, MT.light, { align: 'right' });
    const by = b.y + b.h - 16, bh = 8;
    cv.fillRect(b.x, by, b.w, bh, C.track);
    cv.fillRect(b.x + b.w * f(lim), by, b.w * (1 - f(lim)), bh, withAlpha(MT.red, 0.3));
    if (v != null) cv.fillRect(b.x, by, b.w * f(v), bh, v >= lim ? MT.red : C.text);
    if (isNum(o.peak)) cv.fillRect(b.x + b.w * f(o.peak) - 1, by - 5, 3, bh + 10, MT.deep);
}
function mtStatDraw(cv, b, o) {                                // temperature: type, a hairline, no box
    const v = isNum(o.value) ? o.value : null, min = isNum(o.min) ? o.min : 0, max = o.max > min ? o.max : 100;
    const f = Math.max(0, Math.min(1, (v - min) / (max - min)));
    caps(cv, o.label, b.x, b.y + 22, MT.light, { size: 22 });
    const size = isNum(o.size) ? o.size : Math.min(b.h * 0.5, 76), txt = v == null ? '--' : v.toFixed(dp(o.dec));
    cv.text(txt, b.x, b.y + 22 + size * 0.95, size, v == null ? MT.deep : C.text, { font: 'mont' });
    const w = cv.textWidth(txt, size, { font: 'mont' });
    cv.text(o.unit, b.x + w + 10, b.y + 22 + size * 0.95, 24, MT.light);
    const by = b.y + b.h - 14;
    cv.fillRect(b.x, by, b.w, 6, C.track);
    if (v != null) cv.fillRect(b.x, by, b.w * f, 6, col(o.color, C.text));
}

DRAW.mtrackShell = (cv, t, b, o) => mtShellDraw(cv, b, o);
DRAW.mtrackBg = (cv, t, b, o) => mtBgDraw(cv, b, o);
DRAW.mtrackPanel = (cv, t, b, o) => mtPanelDraw(cv, b, o);
DRAW.mtrackSign = (cv, t, b, o) => syMark(cv, o, b);
DRAW.mtrackRev = (cv, t, b, o) => mtRevDraw(cv, b, o);
DRAW.mtrackHero = (cv, t, b, o) => mtHeroDraw(cv, b, o);
DRAW.mtrackGear = (cv, t, b, o) => mtGearDraw(cv, b, o);
DRAW.mtrackMeter = (cv, t, b, o) => mtMeterDraw(cv, b, o);
DRAW.mtrackStat = (cv, t, b, o) => mtStatDraw(cv, b, o);

TRY.mtrackShell = (cv, b, o, p) => {
    if (p.move) return false;
    const i = mtTabBoxes(cv, b, o).findIndex((t) => inside(t, p));
    if (i < 0) return false;
    o.sel = i;
};
// ============================================================================================
// The other six pages: the same M Track language, drawn by the legacy widget types.
// No cards, no rounded panels: labels in M blue caps, values in Mont Heavy white, hairlines.
// ============================================================================================
const mtHair = (cv, x, y, w) => cv.fillRect(x, y, w, 1, withAlpha(MT.deep, 0.6));

// a number with its unit: y is the baseline, the unit sits on it, 22 px, M blue
function mtBig(cv, x, y, v, unit, size, align) {
    const t = v == null || v === '' ? '--' : String(v);
    if (align === 'right') {
        const uw = unit ? cv.textWidth(String(unit), 22) + 10 : 0;
        cv.text(t, x - uw, y, size, C.text, { font: 'mont', align: 'right' });
        if (unit) cv.text(String(unit), x, y, 22, MT.light, { align: 'right' });
    } else {
        cv.text(t, x, y, size, C.text, { font: 'mont' });
        if (unit) cv.text(String(unit), x + cv.textWidth(t, size, { font: 'mont' }) + 10, y, 22, MT.light);
    }
}

// the header's state chips: a dot and caps text, flat, right to left
function mtChips(cv, xr, y, v) {
    let x = xr;
    chipList(v).reverse().forEach(([t, c]) => {
        const cc = col(c, MT.light), w = capsW(cv, t, 20);
        caps(cv, t, x, y, cc, { size: 20, align: 'right' });
        cv.circle(x - w - 15, y - 7, 5, cc);
        x -= w + 42;
    });
}

// the last minutes: a red crest over a white area, the head as a red dot
function mtSpark(cv, x, y, w, h, vals, lo, hi, color, fill) {
    if (!vals || vals.length < 2 || !(hi > lo)) return;
    const P = vals.map((v, i) => [x + w * i / (vals.length - 1), y + h - h * (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)]);
    if (fill) {
        // one quad per segment, overlapping 1 px: the area stays solid white, no scanline seams
        const base = y + h;
        for (let i = 1; i < P.length; i++) {
            const a = P[i - 1], c = P[i];
            cv.quad([[a[0] - 1, a[1]], [c[0] + 1, c[1]], [c[0] + 1, base], [a[0] - 1, base]], '#ffffff');
        }
    }
    cv.polyline(P, 3, color);
    const e = P[P.length - 1];
    cv.circle(e[0], e[1], 7, color);
}

// Pictures the app sends (the gearbox graphs). Their grey bars are keyed onto M blue:
// grey is the one colour this skin does not have.
const mtTinted = new Map();
DRAW.image = (cv, t, b, o) => {
    const img = o.src ? W.picture(o.src) : null;
    if (!img) { cv.strokeRoundRect(b.x, b.y, b.w, b.h, o.radius || 0, 1, withAlpha(MT.deep, 0.6)); return; }
    let ti = mtTinted.get(img.imageId);
    if (!ti) {
        const src = img.data, out = new Uint8Array(src.length);
        for (let i = 0; i < src.length; i += 4) {
            const r = src[i], g = src[i + 1], bl = src[i + 2], a = src[i + 3];
            const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
            if (a && mx - mn < 30 && mx > 45) { out[i] = 0x81; out[i + 1] = 0xc4; out[i + 2] = 0xff; out[i + 3] = a; }
            else { out[i] = r; out[i + 1] = g; out[i + 2] = bl; out[i + 3] = a; }
        }
        ti = { imageId: img.imageId, w: img.w, h: img.h, data: out };
        mtTinted.set(img.imageId, ti);
    }
    cv.image(ti, b.x, b.y, b.w, b.h, o.radius || 0);
};

// value tile with the last minutes under it (Fuel & air)
DRAW.teleTrend = (cv, t, b, o) => {
    const x = b.x, y = b.y, w = b.w, h = b.h, size = Math.min(96, Math.max(48, h * 0.3));
    caps(cv, o.label, x, y + 22, MT.light, { size: 22 });
    mtBig(cv, x, y + 30 + size, o.value, o.unit, size);
    const lg = items(o.legend);
    if (lg.length === 2) {
        caps(cv, lg[0], x + w, y + 22, C.text, { size: 20, align: 'right' });
        caps(cv, lg[1], x + w - capsW(cv, lg[0], 20) - 30, y + 22, withAlpha(MT.light, 0.7), { size: 20, align: 'right' });
    }
    const sy = y + 30 + size + 26, sh = Math.max(40, y + h - sy - (o.foot ? 40 : 22));
    cv.fillRect(x, sy + sh, w, 1, withAlpha(MT.deep, 0.35));
    if (o.points) mtSpark(cv, x, sy, w, sh, nums(o.points), o.lo, o.hi, MT.red, true);
    if (o.points2) mtSpark(cv, x, sy, w, sh, nums(o.points2), o.lo, o.hi, MT.light, false);
    if (o.foot) cv.text(o.foot, x, y + h - 8, 20, withAlpha(MT.light, 0.8));
    mtHair(cv, x, y + h, w);
};

// label, big value, flat bar with the red zone (DPF)
DRAW.teleBarTile = (cv, t, b, o) => {
    const x = b.x, y = b.y, w = b.w, h = b.h, size = Math.min(96, Math.max(44, h * 0.3));
    caps(cv, o.label, x, y + 22, MT.light, { size: 22 });
    mtBig(cv, x, y + 30 + size, isNum(o.value) ? o.value.toFixed(dp(o.dec)) : null, o.unit, size);
    const by = y + h - 24, f = (v) => (o.max > o.min ? Math.max(0, Math.min(1, (v - o.min) / (o.max - o.min))) : 0);
    const lim = isNum(o.limit) ? o.limit : null, over = isNum(o.value) && lim != null && o.value >= lim;
    cv.fillRect(x, by, w, 6, withAlpha(MT.deep, 0.5));
    if (lim != null && o.max > o.min) cv.fillRect(x + w * f(lim), by, w * (1 - f(lim)), 6, withAlpha(MT.red, 0.35));
    if (isNum(o.value)) cv.fillRect(x, by, w * f(o.value), 6, over ? MT.red : C.text);
    mtHair(cv, x, y + h, w);
};

DRAW.teleMiniTile = (cv, t, b, o) => {
    const x = b.x, y = b.y, w = b.w, h = b.h, size = Math.min(80, Math.max(40, h * 0.32));
    caps(cv, o.label, x, y + 22, MT.light, { size: 22 });
    mtBig(cv, x, y + 30 + size, isNum(o.value) ? o.value.toFixed(dp(o.dec)) : null, o.unit, size);
    const by = y + h - 20;
    cv.fillRect(x, by, w, 6, withAlpha(MT.deep, 0.5));
    if (isNum(o.value)) cv.fillRect(x, by, w * fracOf(o), 6, col(o.color, C.text));
    mtHair(cv, x, y + h, w);
};

DRAW.teleKv = (cv, t, b, o) => {
    const rh = o.rowH || 60;
    lines(o.rows).forEach(([k, v, c], i) => {
        const yy = b.y + i * rh;
        cv.text(String(k), b.x, yy + rh / 2 + 9, 27, withAlpha(MT.light, 0.85));
        cv.text(String(v == null ? '' : v), b.x + b.w, yy + rh / 2 + 9, 30, col(c, C.text), { align: 'right', font: 'mont' });
        mtHair(cv, b.x, yy + rh - 1, b.w);
    });
};

DRAW.teleTable = (cv, t, b, o) => {
    const cols = colList(o.columns), rows = lines(o.rows), rh = o.rowH || 72, tot = cols.reduce((a, c) => a + c[1], 0);
    let cx = b.x; const xs = cols.map((c) => { const s2 = cx; cx += b.w * c[1] / tot; return s2; });
    const at = (i, c) => (c[2] === 'right' ? xs[i] + b.w * c[1] / tot : xs[i]);
    cols.forEach((c, i) => caps(cv, c[0], at(i, c), b.y + 24, MT.light, { size: 22, align: c[2] || 'left' }));
    mtHair(cv, b.x, b.y + 40, b.w);
    rows.forEach((r, j) => {
        const yy = b.y + 44 + j * rh;
        cols.forEach((c, i) => {
            const v = r[i], txt = Array.isArray(v) ? v[0] : v == null ? '' : String(v), cc = Array.isArray(v) ? col(v[1], C.text) : C.text;
            cv.text(txt, at(i, c), yy + rh / 2 + 9, i ? 30 : 27, cc, { align: c[2] || 'left', font: i ? 'mont' : 'label' });
        });
        mtHair(cv, b.x, yy + rh - 1, b.w);
    });
};

DRAW.teleValue = (cv, t, b, o) => {
    const right = o.align === 'right', size = o.size || 64;
    mtBig(cv, right ? b.x + b.w : b.x, b.y + size * 0.82, o.value, o.unit, size, right ? 'right' : 'left');
};

DRAW.teleProgress = (cv, t, b, o) => {
    const y = b.y + 24, f = Math.max(0, Math.min(1, +o.value || 0));
    if (o.label) caps(cv, o.label, b.x, y, MT.light, { size: 22 });
    if (o.right) cv.text(o.right, b.x + b.w, y, 24, C.text, { align: 'right', font: 'mont' });
    cv.fillRect(b.x, y + 16, b.w, 6, withAlpha(MT.deep, 0.5));
    cv.fillRect(b.x, y + 16, b.w * f, 6, col(o.color, MT.red));
};

DRAW.teleEmpty = (cv, t, b, o) => {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (o.head) caps(cv, o.head, cx, cy, withAlpha(MT.light, 0.9), { size: 24, align: 'center' });
    if (o.line) cv.text(o.line, cx, cy + 40, 22, withAlpha(MT.light, 0.6), { align: 'center' });
};

DRAW.teleSeg = (cv, t, b, o) => {
    const its = items(o.items), n = Math.max(1, its.length), bw = b.w / n, sel = o.sel | 0;
    its.forEach((it, i) => {
        const cx = b.x + i * bw;
        caps(cv, it, cx + bw / 2, b.y + b.h / 2 + 8, i === sel ? C.text : withAlpha(MT.light, 0.7), { size: 20, align: 'center' });
        if (i === sel) cv.fillRect(cx + bw * 0.28, b.y + b.h - 8, bw * 0.44, 2, MT.red);
    });
    mtHair(cv, b.x, b.y + b.h - 1, b.w);
};

DRAW.teleButton = (cv, t, b, o) => {
    const primary = o.kind === 'primary', danger = String(o.kind || '').indexOf('danger') >= 0, off = !!o.disabled;
    cv.strokeRoundRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 0, 1, off ? withAlpha(MT.deep, 0.4) : danger ? withAlpha(MT.red, 0.85) : withAlpha(MT.deep, 0.95));
    caps(cv, o.text || '', b.x + b.w / 2, b.y + b.h / 2 + 8, off ? withAlpha(MT.deep, 0.8) : danger ? MT.red : C.text, { size: 20, align: 'center' });
    if (primary) cv.fillRect(b.x + b.w * 0.3, b.y + b.h - 5, b.w * 0.4, 2, MT.red);
};

DRAW.teleRow = (cv, t, b, o) => {
    const P = rowParts(b, o), right = b.x + b.w - 8, off = !!o.disabled, c = o.control;
    cv.text(o.label || '', b.x, b.y + (o.sub ? b.h / 2 - 6 : b.h / 2 + 10), 30, off ? withAlpha(MT.deep, 0.9) : C.text);
    if (o.sub) cv.text(o.sub, b.x, b.y + b.h / 2 + 30, 22, withAlpha(MT.light, 0.75));
    if (c === 'slider') {
        const ty = b.y + b.h / 2 - 3, tw = P.slider.w, f = fracOf(o);
        cv.fillRect(P.slider.x, ty, tw, 6, withAlpha(MT.deep, 0.55));
        cv.fillRect(P.slider.x, ty, tw * f, 6, off ? MT.deep : C.text);
        cv.fillRect(P.slider.x + tw * f - 2, ty - 12, 4, 30, off ? MT.deep : C.text);
        mtBig(cv, right, b.y + b.h / 2 + 10, shownValue(o), null, 30, 'right');
    } else if (c === 'seg') {
        DRAW.teleSeg(cv, t, { x: P.seg.x, y: P.seg.y, w: P.seg.w, h: P.seg.h }, { items: o.items, sel: o.sel, disabled: off });
    } else if (c === 'toggle') {
        const tw = 116, th = 62, tx = P.toggle.x + P.toggle.w - tw;
        cv.strokeRoundRect(tx + 0.5, P.toggle.y + 0.5, tw - 1, th - 1, 0, 1, withAlpha(o.on ? MT.light : MT.deep, 0.9));
        if (o.on) cv.fillRect(tx + 6, P.toggle.y + 6, tw - 12, th - 12, withAlpha(MT.light, 0.9));
    } else {
        if (c === 'chevron') vicon(cv, 'chevron', right - 38, b.y + (b.h - 40) / 2, 40, withAlpha(MT.light, 0.7));
        cv.text(o.text || '', c === 'chevron' ? right - 44 : right, b.y + b.h / 2 + 10, 28, off ? MT.deep : col(o.textColor, MT.light), { align: 'right', font: 'mont' });
    }
    mtHair(cv, b.x, b.y + b.h - 1, b.w);
};
// ---------------------------------------------------------------------------
// Runtime translation. src/ sends its labels, tabs and table headers as English
// strings at run time, so the static Turkish in screens.json is only the idle
// stand-in. Every draw is wrapped once: option text goes through the dictionary
// below, dynamic parts ("· peak 7200", "last 5 min · min 25") through rules.
// Output is ASCII folded: the BMW TA atlases have no Turkish glyphs.
// ---------------------------------------------------------------------------
// Runtime ceviri: app (src/) metinleri calisma aninda gonderiyor, bu yuzden ceviri cizim katmaninda.
// Cikti ASCII: BMU TA atlasinda Turkce harf yok, bkz. TASARIM-NOTLARI.
const FOLD = { 'Ç': 'C', 'ç': 'c', 'Ğ': 'G', 'ğ': 'g', 'İ': 'I', 'ı': 'i', 'Ö': 'O', 'ö': 'o', 'Ş': 'S', 'ş': 's', 'Ü': 'U', 'ü': 'u', 'Â': 'A', 'â': 'a', 'Î': 'I', 'î': 'i', 'Û': 'U', 'û': 'u' };
const fold = (s) => s.replace(/[ÇçĞğİıÖöŞşÜüÂâÎîÛû]/g, (c) => FOLD[c]);

// tam eslesme: app'in gonderdigi metin -> kisa Turkce karsilik
const MAP = {
    'Engine': 'Motor', 'Fuel & air': 'Yakit ve hava', 'Trips': 'Yolculuklar', 'Transmission': 'Sanziman',
    'DPF': 'Partikul filtresi', 'Details': 'Detaylar', 'Settings': 'Ayarlar', 'Car Data': 'SY Car Data',
    'Engine speed': 'Motor devri', 'Speed': 'Hiz', 'Power': 'Guc', 'Torque': 'Tork', 'Boost': 'Turbo basinci',
    'Oil': 'Yag', 'Coolant': 'Sogutma suyu', 'Intake air': 'Emme havasi', 'Battery': 'Aku',
    'High pressure fuel': 'Yuksek basinc yakit', 'Low pressure fuel': 'Alcak basinc yakit',
    'Intake air above outside': 'Emme havasi dis havanin ustunde', 'Ignition timing': 'Atesleme avansi',
    'Actual, Target': 'Gercek, Hedef', 'last 5 min': 'son 5 dk', 'heat soak': 'isi emilimi', 'before TDC': 'UON oncesi',
    'From the DME · each with its last 5 minutes': "DME'den · her biri son 5 dakikasiyla",
    'Counted while Car Data runs, also with its screen closed': 'SY Car Data calisirken sayilir, ekrani kapaliyken de',
    'Paused': 'Duraklatildi', 'Paused · open a tab to resume': 'Duraklatildi · devam icin bir sekme ac',
    'README': 'README', 'Experimental': 'Deneysel', 'Read-only': 'Salt okunur', 'Filter OK': 'Filtre iyi',
    'Regeneration due': 'Rejenerasyon yaklasiyor', 'Engine off': 'Motor kapali', 'No fuel figure yet': 'Henuz yakit verisi yok',
    'No answer': 'Yanit yok', 'It answers with the ignition on.': 'Kontak acikken yanit verir.',
    'The gearbox unit does not answer': 'Sanziman beyni yanit vermiyor',
    'no value from the DME yet': 'DME den henuz deger yok', 'Reading…': 'Okunuyor…',
    'Read from the gearbox unit, nothing is written': 'Sanziman beyninden okunur, hicbir sey yazilmaz',
    'ZF 8HP · read from the gearbox unit, nothing is written': 'ZF 8HP · sanziman beyninden okunur, hicbir sey yazilmaz',
    'From the diesel engine unit · nothing is written': 'Dizel motor beyninden · hicbir sey yazilmaz',
    'Input speed': 'Giris devri', 'Output speed': 'Cikis devri', 'Converter slip': 'Konvertor kaymasi',
    'Lock-up clutch': 'Kilit kavramasi', 'Selector': 'Secici', 'Operating hours': 'Calisma saati',
    'Gearbox unit': 'Sanziman beyni', 'Sources': 'Kaynaklar', 'Distance': 'Mesafe', 'Fuel': 'Yakit',
    'Average': 'Ortalama', 'Cost': 'Maliyet', 'Time': 'Sure', 'Started': 'Baslangic', 'Interval': 'Aralik',
    'Top speed': 'Azami hiz', 'Fuel price': 'Yakit fiyati', 'Currency': 'Para birimi', 'Today': 'Bugun',
    '7 days': '7 gun', '30 days': '30 gun', 'Last trip': 'Son yolculuk', 'No trips yet': 'Henuz yolculuk yok',
    'Oil': 'Yag', 'Timing': 'Avans', 'Charge air': 'Dolum havasi', 'Radiator outlet': 'Radyator cikisi',
    'Oil after filter': 'Filtre sonrasi yag', 'Oil in the sump': 'Karterdeki yag', 'Oil pressure': 'Yag basinci',
    'Oil level above min': 'Minimum ustu yag', 'Oil life left': 'Kalan yag omru', 'Rail pressure': 'Ray basinci',
    'Lambda bank 1 · 2': 'Lambda banka 1 · 2', 'Knock retard': 'Vuruntu gecikmesi', 'Intake actual · target': 'Emme gercek · hedef',
    'Exhaust actual · target': 'Egzoz gercek · hedef', 'Injection': 'Enjeksiyon', 'Regenerations': 'Rejenerasyon',
    'Soot mass': 'Kurum kutlesi', 'Differential pressure': 'Diferansiyel basinc', 'Exhaust temperature': 'Egzoz sicakligi',
    'BAR ENDS · PERFORMANCE': 'BAR UCLARI · PERFORMANS', 'BAR ENDS · TEMPERATURES': 'BAR UCLARI · SICAKLIKLAR',
    'Restore defaults': 'Varsayilanlara don', 'none': 'yok', 'slider': 'kaydirici',
    'DME not answering': 'DME yanit vermiyor', 'Waiting for the DME': 'DME bekleniyor',
    'Live from the DME': 'DME den canli', 'all ok': 'tumu iyi', 'nothing yet': 'henuz yok',
    'not offered': 'sunulmuyor', 'no answer': 'yanit yok', 'page left': 'sayfadan cikildi',
};

// kaliplar: degeri koruyarak ceviren kurallar
const RULES = [
    [/^(.*) · peak ([\d., ]+)$/, (m) => tr(m[1]) + ' · tepe ' + m[2]],
    [/^last 5 min · min ([\d., -]+) · max ([\d., -]+)$/, (m) => 'son 5 dk · en dusuk ' + m[1] + ' · en yuksek ' + m[2]],
    [/^heat soak · min ([\d., -]+) · max ([\d., -]+)$/, (m) => 'isi emilimi · en dusuk ' + m[1] + ' · en yuksek ' + m[2]],
    [/^before TDC · min ([\d., -]+) · max ([\d., -]+)$/, (m) => 'UON oncesi · en dusuk ' + m[1] + ' · en yuksek ' + m[2]],
    [/^actual ([\d., -]+) · target ([\d., -]+) · last 5 min$/, (m) => 'gercek ' + m[1] + ' · hedef ' + m[2] + ' · son 5 dk'],
    [/^actual ([\d., -]+) · last 5 min$/, (m) => 'gercek ' + m[1] + ' · son 5 dk'],
    [/^Engine unit values in groups · (\d+) of (\d+) values read$/, (m) => 'Motor beyni degerleri gruplar halinde · ' + m[2] + ' degerin ' + m[1] + ' i okundu'],
    [/^Engine unit values in groups · reading the engine unit$/, () => 'Motor beyni degerleri gruplar halinde · motor beyni okunuyor'],
    [/^Regenerating · (.*)$/, (m) => 'Rejenerasyon suruyor · ' + m[1]],
    [/^Now ([\d.,]+) l\/h · ([\d.,]+) l\/100 km$/, (m) => 'Su an ' + m[1] + ' l/sa · ' + m[2] + ' l/100 km'],
    [/^Now ([\d.,]+) l\/h · standing$/, (m) => 'Su an ' + m[1] + ' l/sa · rolantide'],
    [/^Red zone from (.+)$/, (m) => 'Kirmizi bolge ' + m[1] + " den"],
    [/^Scale from (.+)$/, (m) => 'Olcek ' + m[1] + " den"],
    [/^Next one in about$/, () => 'Sonrakine yaklasik'],
    [/^Last trip · (.*)$/, (m) => 'Son yolculuk · ' + m[1]],
    [/^(\d+) of (\d+)$/, (m) => m[1] + ' / ' + m[2]],
];

function tr(s) {
    if (typeof s !== 'string' || !s) return s;
    if (!/[A-Za-z]/.test(s)) return s;                       // sayi / birim
    if (MAP[s] !== undefined) return MAP[s];
    for (const [re, fn] of RULES) {
        const m = re.exec(s);
        if (m) { try { return fn(m); } catch (e) { return s; } }
    }
    return s;
}

// 'a|b' / 'a;b' / 'a,b' / satir yapilarini bozmadan cevir
function trField(s) {
    if (typeof s !== 'string') return s;
    if (s.indexOf('\n') >= 0) return s.split('\n').map(trField).join('\n');
    if (s.indexOf('|') >= 0) return s.split('|').map((p) => trField(p.trim())).join('|');
    if (s.indexOf(';') >= 0) return s.split(';').map((p) => trField(p.trim())).join(';');
    return tr(s);
}

const TR_KEYS = ['label', 'sub', 'text', 'head', 'line', 'foot', 'legend', 'unit', 'tabs', 'chips', 'items', 'columns', 'rows', 'title'];
const TR_CACHE = new WeakMap();          // ayni opts nesnesi her karede yeniden cevrilmesin
function trOpts(o) {
    if (!o || typeof o !== 'object') return o;
    const hit = TR_CACHE.get(o);
    if (hit) return hit;
    let out = null;
    for (const k of TR_KEYS) {
        const v = o[k];
        if (typeof v !== 'string' || !v) continue;
        let n;
        if (k === 'columns') {
            n = v.split(',').map((c) => { const p = c.split(':'); p[0] = tr(p[0].trim()); return p.join(':'); }).join(', ');
        } else if (k === 'tabs' || k === 'items') {
            n = v.split(',').map((p) => tr(p.trim())).join(', ');
        } else {
            n = trField(v);
        }
        if (n !== v) { if (!out) out = Object.assign({}, o); out[k] = n; }
    }
    const res = out || o;
    TR_CACHE.set(o, res);
    return res;
}

// screens.json / app metinlerinin tam eslesme sozlugu (ASCII katlanmis)
const DICT = {
    "Car Data": "Car Data",
    "Engine, Fuel & air, Trips, Transmission, DPF, Details, Settings": "Motor, Yakit ve hava, Yolculuklar, Sanziman, DPF, Detaylar, Ayarlar",
    "Engine": "Motor",
    "Fuel & air": "Yakit ve hava",
    "Trips": "Yolculuklar",
    "Transmission": "Sanziman",
    "DPF": "Partikul filtresi",
    "Details": "Detaylar",
    "Settings": "Ayarlar",
    "Engine speed": "Motor devri",
    "Speed": "Hiz",
    "Power": "Guc",
    "Torque": "Tork",
    "Boost": "Turbo basinci",
    "Oil": "Yag",
    "Coolant": "Sogutma suyu",
    "Intake air": "Emme havasi",
    "Battery": "Aku",
    "From the DME · each with its last 5 minutes": "DME'den · her biri son 5 dakikasiyla",
    "last 5 min · min 25 · max 37": "son 5 dk · en dusuk 25 · en yuksek 37",
    "High pressure fuel": "Yuksek basinc yakit",
    "last 5 min · min 37 · max 338": "son 5 dk · en dusuk 37 · en yuksek 338",
    "Low pressure fuel": "Alcak basinc yakit",
    "last 5 min · min 4.5 · max 5.4": "son 5 dk · en dusuk 4.5 · en yuksek 5.4",
    "Intake air above outside": "Emme havasi dis havanin ustunde",
    "heat soak · min 8 · max 19": "isi emilimi · en dusuk 8 · en yuksek 19",
    "Ignition timing": "Atesleme avansi",
    "before TDC · min 7.3 · max 31.1": "UON oncesi · en dusuk 7.3 · en yuksek 31.1",
    "actual 1.12 · target 1.18 · last 5 min": "gercek 1.12 · hedef 1.18 · son 5 dk",
    "Actual, Target": "Gercek, Hedef",
    "Now 8.4 l/h · 9.1 l/100 km|accent": "Su an 8.4 l/sa · 9.1 l/100 km|accent",
    "Counted while Car Data runs, also with its screen closed": "Car Data calisirken sayilir, ekrani kapaliyken de",
    "LAST TRIP · 30 OCT, 10:31 - 10:48": "SON YOLCULUK · 30 EKI, 10:31 - 10:48",
    "DISTANCE": "MESAFE",
    "FUEL USED": "TUKETILEN YAKIT",
    "CONSUMPTION": "TUKETIM",
    "COST": "MALIYET",
    "TIME": "SURE",
    "AVERAGE": "ORTALAMA",
    "standing 0.08 l · top speed 74 km/h · odometer 12137 - 12147 km · tank 37 - 36 l": "rolanti 0.08 l · azami hiz 74 km/h · sayac 12137 - 12147 km · depo 37 - 36 l",
    "Started:1.4, Time:0.8:right, Distance:1:right, Fuel:0.8:right, l/100 km:1:right, Cost:1:right, Top speed:1.1:right": "Baslangic:1.4, Sure:0.8:right, Mesafe:1:right, Yakit:0.8:right, l/100 km:1:right, Maliyet:1:right, Azami hiz:1.1:right",
    "30 Oct, 10:31 | 0:17 h | 9.8 km | 1.21 l | 12.3 | 2.18 EUR | 74 km/h": "30 Eki, 10:31 | 0:17 sa | 9.8 km | 1.21 l | 12.3 | 2.18 EUR | 74 km/h",
    "28 Oct, 15:31 | 0:55 h | 64.8 km | 5.41 l | 8.3 | 9.74 EUR | 171 km/h": "28 Eki, 15:31 | 0:55 sa | 64.8 km | 5.41 l | 8.3 | 9.74 EUR | 171 km/h",
    "27 Oct, 15:31 | 0:12 h | 6.4 km | 0.98 l | 15.3 | 1.76 EUR | 62 km/h": "27 Eki, 15:31 | 0:12 sa | 6.4 km | 0.98 l | 15.3 | 1.76 EUR | 62 km/h",
    "Today, 7 days, 30 days": "Bugun, 7 gun, 30 gun",
    "Trips | 6": "Yolculuk | 6",
    "Distance | 87.0 km": "Mesafe | 87.0 km",
    "Fuel | 8.9 l": "Yakit | 8.9 l",
    "Average | 10.2 l/100 km": "Ortalama | 10.2 l/100 km",
    "Fuel price | 1.80 EUR/l | accent": "Yakit fiyati | 1.80 EUR/l | accent",
    "No trips yet": "Henuz yolculuk yok",
    "A trip runs from engine start until the engine is off and the car has stood 10 min.": "Yolculuk motor calisinca baslar; motor kapanip arac 10 dk durunca biter.",
    "Trips | 0": "Yolculuk | 0",
    "Distance | --": "Mesafe | --",
    "Fuel | --": "Yakit | --",
    "Average | --": "Ortalama | --",
    "Experimental|warn; Read-only|dim": "Deneysel|warn; Salt okunur|dim",
    "ZF 8HP · read from the gearbox unit, nothing is written": "ZF 8HP · sanziman beyninden okunur, hicbir sey yazilmaz",
    "LIVE": "CANLI",
    "GEARBOX OIL": "SANZIMAN YAGI",
    "Input speed | 2410 rpm": "Giris devri | 2410 rpm",
    "Output speed | 1260 rpm": "Cikis devri | 1260 rpm",
    "Converter slip | 12 rpm": "Konvertor kaymasi | 12 rpm",
    "Lock-up clutch | Locked high | ok": "Kilit kavramasi | Kilitli yuksek | ok",
    "Selector | D": "Secici | D",
    "CLUTCH ADAPTATIONS": "KAVRAMA UYARLAMALARI",
    "Fill pressure offset per clutch, against the factory value": "Fabrika degerine gore kavrama basina dolum basinci sapmasi",
    "CLUTCH A": "KAVRAMA A",
    "CLUTCH B": "KAVRAMA B",
    "CLUTCH C": "KAVRAMA C",
    "CLUTCH D": "KAVRAMA D",
    "CLUTCH E": "KAVRAMA E",
    "OIL TEMPERATURE HISTORY": "YAG SICAKLIGI GECMISI",
    "Operating hours | 1 284 h": "Calisma saati | 1 284 sa",
    "Gearbox unit | GSZFBCE · 0F25D0": "Sanziman beyni | GSZFBCE · 0F25D0",
    "This gearbox variant is not supported yet": "Bu sanziman varyanti henuz desteklenmiyor",
    "VARIANT READ FROM THE GEARBOX UNIT": "SANZIMAN BEYNINDEN OKUNAN VARYANT",
    "Its values show here once this variant is added.": "Bu varyant eklendiginde degerleri burada gorunur.",
    "Filter OK|ok; Experimental|warn; Read-only|dim": "Filtre iyi|ok; Deneysel|warn; Salt okunur|dim",
    "From the diesel engine unit · nothing is written": "Dizel motor beyninden · hicbir sey yazilmaz",
    "Soot · regeneration at ~24 g (typical)": "Kurum · rejenerasyon ~24 g'da (tipik)",
    "Since the last regeneration | 168 km": "Son rejenerasyondan beri | 168 km",
    "Next one in about | 50 km": "Sonrakine yaklasik | 50 km",
    "Fuel since then | 9.4 l": "O zamandan beri yakit | 9.4 l",
    "Engine running since then | 1:41 h": "O zamandan beri motor calismasi | 1:41 sa",
    "Regenerations so far | 127": "Simdiye kadar rejenerasyon | 127",
    "Exhaust temperature": "Egzoz sicakligi",
    "Before DPF, Before cat": "DPF oncesi, Katalizor oncesi",
    "before the cat 308 °C · last 5 min · a regeneration runs at ~600 °C": "katalizor oncesi 308 °C · son 5 dk · rejenerasyon ~600 °C'de calisir",
    "Differential pressure": "Diferansiyel basinc",
    "across the filter · last 5 min · min 31 · max 52": "filtre genelinde · son 5 dk · en dusuk 31 · en yuksek 52",
    "ENGINE UNIT HISTORY": "MOTOR BEYNI GECMISI",
    "#:0.35, At odometer:1.3:right, Interval:1:right": "#:0.35, Kilometre:1.3:right, Aralik:1:right",
    "Average interval | 412 km": "Ortalama aralik | 412 km",
    "Oil ash | 41.7 g": "Yag kulu | 41.7 g",
    "Soot, calculated | 19.8 g": "Kurum, hesaplanan | 19.8 g",
    "No particulate filter values from the engine unit": "Motor beyninden partikul filtresi degeri gelmiyor",
    "This page is for diesel engines: their engine unit (DDE) gives these values.": "Bu sayfa dizel motorlar icin: bu degerleri motor beyni (DDE) verir.",
    "Reading|ok": "Okunuyor|ok",
    "Engine unit values in groups · 46 of 76 values read": "Motor beyni degerleri gruplar halinde · 76 degerin 46'si okundu",
    "ENGINE": "MOTOR",
    "Engine speed | 1571 rpm": "Motor devri | 1571 rpm",
    "Engine load | 26 %": "Motor yuku | 26 %",
    "Accelerator pedal | 46 %": "Gaz pedali | 46 %",
    "Throttle | 21 %": "Kelebek | 21 %",
    "Engine torque | 191 Nm": "Motor torku | 191 Nm",
    "Time since start | 1491 s": "Calisma suresi | 1491 sn",
    "OIL": "YAG",
    "Oil pressure | 2.90 bar": "Yag basinci | 2.90 bar",
    "Oil level above min | 0.49 l": "Minimum ustu yag | 0.49 l",
    "Oil life left | 71 %": "Kalan yag omru | 71 %",
    "TEMPERATURES": "SICAKLIKLAR",
    "Coolant | 77 °C": "Sogutma suyu | 77 °C",
    "Radiator outlet | 89 °C": "Radyator cikisi | 89 °C",
    "Oil after filter | 96 °C": "Filtre sonrasi yag | 96 °C",
    "Oil in the sump | 76 °C": "Karterdeki yag | 76 °C",
    "Intake air | 37 °C": "Emme havasi | 37 °C",
    "Charge air | 41 °C": "Dolum havasi | 41 °C",
    "FUEL": "YAKIT",
    "Rail pressure | 320 bar": "Ray basinci | 320 bar",
    "Low pressure fuel | 4.6 bar": "Alcak basinc yakit | 4.6 bar",
    "Lambda bank 1 · 2 | 1.00 · 0.99": "Lambda banka 1 · 2 | 1.00 · 0.99",
    "IGNITION AND KNOCK": "ATESLEME VE VURUNTU",
    "Timing | 10.8 °": "Avans | 10.8 °",
    "Knock retard cyl 1 · 2 | 0.0 · 0.0 °": "Vuruntu gecikmesi sil 1 · 2 | 0.0 · 0.0 °",
    "Knock retard cyl 3 · 4 | 0.0 · 1.5 ° | warn": "Vuruntu gecikmesi sil 3 · 4 | 0.0 · 1.5 ° | warn",
    "Knock retard cyl 5 · 6 | 0.0 · 0.0 °": "Vuruntu gecikmesi sil 5 · 6 | 0.0 · 0.0 °",
    "VANOS": "VANOS",
    "Intake actual · target | 84 · 85 °": "Emme gercek · hedef | 84 · 85 °",
    "Exhaust actual · target | -92 · -92 °": "Egzoz gercek · hedef | -92 · -92 °",
    "INJECTOR CORRECTIONS": "ENJEKTOR DUZELTMELERI",
    "Cyl 1 · 2 | +1.2 · -0.4 %": "Sil 1 · 2 | +1.2 · -0.4 %",
    "Cyl 3 · 4 | +0.3 · +2.8 % | warn": "Sil 3 · 4 | +0.3 · +2.8 % | warn",
    "Cyl 5 · 6 | -0.9 · +0.1 %": "Sil 5 · 6 | -0.9 · +0.1 %",
    "DATA LINKS": "VERI BAGLANTILARI",
    "Sources | all ok | ok": "Kaynaklar | tumu iyi | ok",
    "OBD PIDs (DME) | 04 05 0B 0C 0D 0F 11 …": "OBD PID (DME) | 04 05 0B 0C 0D 0F 11 …",
    "OBD PIDs (EGS) | A4": "OBD PID (EGS) | A4",
    "Updates | rpm 19.8/s · speed 9.8/s": "Guncelleme | rpm 19.8/s · hiz 9.8/s",
    "Reading the engine unit": "Motor beyni okunuyor",
    "12 of 89": "12 / 89",
    "The engine unit does not answer": "Motor beyni yanit vermiyor",
    "It answers with the ignition on: its values show here then.": "Kontak acikken yanit verir; degerleri o zaman burada gorunur.",
    "Bar ends and trip costs · saved on the head unit, used at once": "Bar uclari ve yolculuk maliyeti · unitede saklanir, hemen kullanilir",
    "BAR ENDS · PERFORMANCE": "BAR UCLARI · PERFORMANS",
    "Red zone from 7200 rpm": "Kirmizi bolge 7200 rpm'den",
    "Red zone from 2.25 bar": "Kirmizi bolge 2.25 bar'dan",
    "Red zone from 450 hp": "Kirmizi bolge 450 hp'den",
    "Red zone from 630 Nm": "Kirmizi bolge 630 Nm'den",
    "BAR ENDS · TEMPERATURES": "BAR UCLARI · SICAKLIKLAR",
    "Scale from 40 °C": "Olcek 40 °C'den",
    "Scale from -20 °C": "Olcek -20 °C'den",
    "The red zone is the last 10 % of each bar.": "Kirmizi bolge her barin son %10'u.",
    "TRIPS": "YOLCULUKLAR",
    "Fuel price": "Yakit fiyati",
    "Per litre · for the cost on Trips": "Litre basina · Yolculuklar'daki maliyet icin",
    "Currency": "Para birimi",
    "For the fuel price and the costs · tap for the next": "Yakit fiyati ve maliyetler icin · sonraki icin dokun",
    "Restore defaults": "Varsayilanlara don"
};
for (const k of Object.keys(DICT)) if (MAP[k] === undefined) MAP[k] = DICT[k];

// her cizimi sar: secenek metinleri sozlukten gecsin
for (const k of Object.keys(DRAW)) {
    const fn = DRAW[k];
    DRAW[k] = function (cv, t, b, o) { return fn(cv, t, b, trOpts(o)); };
}

module.exports = { DRAW, TRY, C, T, CAPS, CREDIT, SHELL, shellBoxes, dialogLayout, keyBoxes,
    caps, hair, fit, empty, videoBox };                            // the drawing helpers tele-clipgrid.js shares
