import { v4 as uuidv4 } from 'uuid';
import { Card } from './types';

export function parseCsv(text: string): Array<Pick<Card, 'characters' | 'pinyin' | 'meaning'>> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const header = lines[0].toLowerCase();
  const hasHeader = header.includes('characters') || header.includes('meaning');
  const rows = hasHeader ? lines.slice(1) : lines;

  return rows.map((row) => {
    const cols = row.split(',').map((c) => c.trim());
    if (cols.length === 2) {
      return { characters: cols[0], meaning: cols[1], pinyin: '' };
    }
    return { characters: cols[0], pinyin: cols[1], meaning: cols[2] };
  }).filter((r) => r.characters && r.meaning);
}

export function toCsv(cards: Card[]): string {
  const header = 'id,characters,pinyin,meaning,status,dueAt';
  const rows = cards.map((c) => [c.id, c.characters, c.pinyin ?? '', c.meaning, c.status, c.dueAt].join(','));
  return [header, ...rows].join('\n');
}

export function makeCard(input: Pick<Card, 'characters' | 'pinyin' | 'meaning'>): Card {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    characters: input.characters,
    pinyin: input.pinyin,
    meaning: input.meaning,
    status: 0,
    dueAt: now,
    createdAt: now,
    updatedAt: now,
    streak: 0,
    lapses: 0
  };
}

export function downloadText(filename: string, data: string, mimeType: string) {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
