import Dexie, { Table } from 'dexie';
import { Card, Review, Settings } from './types';
import { defaultSettings } from './srs';

interface SettingRecord {
  key: string;
  value: Settings;
}

class FlashDb extends Dexie {
  cards!: Table<Card, string>;
  reviews!: Table<Review, string>;
  settings!: Table<SettingRecord, string>;

  constructor() {
    super('flash-character-db');
    this.version(1).stores({
      cards: 'id, characters, dueAt, status, updatedAt',
      reviews: 'id, cardId, reviewedAt',
      settings: 'key'
    });
  }
}

export const db = new FlashDb();

export async function loadSettings(): Promise<Settings> {
  const record = await db.settings.get('app-settings');
  if (!record) {
    await saveSettings(defaultSettings);
    return defaultSettings;
  }
  return { ...defaultSettings, ...record.value };
}

export function saveSettings(settings: Settings) {
  return db.settings.put({ key: 'app-settings', value: settings });
}
