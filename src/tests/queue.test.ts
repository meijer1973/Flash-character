import { describe, expect, it } from 'vitest';
import { initializeSession, markCorrect, markWrong } from '../lib/session';

const cards = [
  { id: 'a', characters: '你', meaning: 'you', status: 0, dueAt: '', createdAt: '', updatedAt: '', streak: 0, lapses: 0 },
  { id: 'b', characters: '好', meaning: 'good', status: 0, dueAt: '', createdAt: '', updatedAt: '', streak: 0, lapses: 0 }
] as any;

describe('queue behavior', () => {
  it('requeues wrong cards to end until correct', () => {
    let session = initializeSession(cards);
    expect(session.queue).toEqual(['a', 'b']);
    session = markWrong(session, 'a');
    expect(session.queue).toEqual(['b', 'a']);
    expect(session.cardState.a.wasWrongThisSession).toBe(true);
    session = markCorrect(session, 'b');
    expect(session.queue).toEqual(['a']);
    session = markCorrect(session, 'a');
    expect(session.queue).toEqual([]);
  });
});
