import { Card, SessionCardState } from './types';

export interface SessionState {
  queue: string[];
  cardState: Record<string, SessionCardState>;
}

export function initializeSession(cards: Card[]): SessionState {
  const queue = cards.map((c) => c.id);
  const cardState: Record<string, SessionCardState> = {};
  for (const card of cards) {
    cardState[card.id] = { attemptsThisSession: 0, wasWrongThisSession: false };
  }
  return { queue, cardState };
}

export function markWrong(session: SessionState, cardId: string): SessionState {
  const [, ...rest] = session.queue;
  const current = session.cardState[cardId] ?? { attemptsThisSession: 0, wasWrongThisSession: false };
  return {
    queue: [...rest, cardId],
    cardState: {
      ...session.cardState,
      [cardId]: {
        attemptsThisSession: current.attemptsThisSession + 1,
        wasWrongThisSession: true
      }
    }
  };
}

export function markCorrect(session: SessionState, cardId: string): SessionState {
  const [, ...rest] = session.queue;
  const current = session.cardState[cardId] ?? { attemptsThisSession: 0, wasWrongThisSession: false };
  return {
    queue: rest,
    cardState: {
      ...session.cardState,
      [cardId]: {
        attemptsThisSession: current.attemptsThisSession + 1,
        wasWrongThisSession: current.wasWrongThisSession
      }
    }
  };
}
