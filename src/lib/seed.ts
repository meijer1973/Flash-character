import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import { Card } from './types';

const demoRows: Array<Pick<Card, 'characters' | 'pinyin' | 'meaning'>> = [
  { characters: '古', pinyin: 'gǔ', meaning: 'ancient' },
  { characters: '亡', pinyin: 'wáng', meaning: 'to perish' },
  { characters: '状', pinyin: 'zhuàng', meaning: 'condition' },
  { characters: '鲁', pinyin: 'lǔ', meaning: 'crude' },
  { characters: '疗', pinyin: 'liáo', meaning: 'to treat' },
  { characters: '操', pinyin: 'cāo', meaning: 'to operate' },
  { characters: '遗', pinyin: 'yí', meaning: 'to leave behind' },
  { characters: '判', pinyin: 'pàn', meaning: 'to judge' },
  { characters: '响', pinyin: 'xiǎng', meaning: 'sound' },
  { characters: '网', pinyin: 'wǎng', meaning: 'net' },
  { characters: '箱', pinyin: 'xiāng', meaning: 'box' },
  { characters: '货', pinyin: 'huò', meaning: 'goods' },
  { characters: '围', pinyin: 'wéi', meaning: 'to surround' },
  { characters: '签', pinyin: 'qiān', meaning: 'to sign' },
  { characters: '牌', pinyin: 'pái', meaning: 'card' },
  { characters: '户', pinyin: 'hù', meaning: 'household' },
  { characters: '寻', pinyin: 'xún', meaning: 'to search' },
  { characters: '质', pinyin: 'zhì', meaning: 'quality' },
  { characters: '供', pinyin: 'gōng', meaning: 'to supply' },
  { characters: '奖', pinyin: 'jiǎng', meaning: 'prize' },
  { characters: '袋', pinyin: 'dài', meaning: 'bag' },
  { characters: '胡', pinyin: 'hú', meaning: 'reckless' },
  { characters: '脏', pinyin: 'zāng', meaning: 'dirty' },
  { characters: '堂', pinyin: 'táng', meaning: 'hall' },
  { characters: '曼', pinyin: 'màn', meaning: 'graceful' },
  { characters: '效', pinyin: 'xiào', meaning: 'effect' },
  { characters: '露', pinyin: 'lù', meaning: 'to reveal' },
  { characters: '替', pinyin: 'tì', meaning: 'to replace' },
  { characters: '娜', pinyin: 'nà', meaning: 'elegant' },
  { characters: '座', pinyin: 'zuò', meaning: 'seat' }
];

let seededAttempted = false;

export async function seedDemoCardsIfEmpty(): Promise<boolean> {
  if (seededAttempted) {
    return false;
  }
  seededAttempted = true;

  const now = new Date().toISOString();

  return db.transaction('rw', db.cards, async () => {
    const count = await db.cards.count();
    if (count > 0) {
      return false;
    }

    const cards: Card[] = demoRows.map((row) => ({
      id: uuidv4(),
      characters: row.characters,
      pinyin: row.pinyin,
      meaning: row.meaning,
      status: 0,
      dueAt: now,
      createdAt: now,
      updatedAt: now,
      lastAnswerMs: 0,
      streak: 0,
      lapses: 0
    }));

    await db.cards.bulkAdd(cards);
    return true;
  });
}
