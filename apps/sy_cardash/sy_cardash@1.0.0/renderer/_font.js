const j = JSON.parse(require('fs').readFileSync('./kit/fonts/bold.json', 'utf8'));
console.log('ust anahtarlar:', Object.keys(j));
const s = j.sizes[0];
console.log('size alanlari:', Object.keys(s), 'boyut:', s.size, s.atlasW + 'x' + s.atlasH, 'ascent', s.ascent, 'descent', s.descent);
const g = Object.entries(s.glyphs).slice(0, 3);
console.log('glif ornegi:', JSON.stringify(g));
console.log('glif sayisi:', Object.keys(s.glyphs).length, '| boyutlar:', j.sizes.map(x => x.size).join(', '));
