import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db, loadSettings, saveSettings } from './lib/db';
import { downloadText, makeCard, parseCsv, toCsv } from './lib/io';
import { defaultSettings, getIntervalHoursForStatus, isFastEligible, nextStatusOnCorrect, statusOnWrong } from './lib/srs';
import { initializeSession, markCorrect, markWrong, SessionState } from './lib/session';
import { Card, CardField, Review, Settings } from './lib/types';
import './styles.css';

type Screen = 'home' | 'review' | 'cards' | 'import' | 'settings' | 'print';

function fieldText(card: Card, field: CardField): string {
  return card[field] ?? '';
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [cards, setCards] = useState<Card[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [session, setSession] = useState<SessionState | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [frontStartedAt, setFrontStartedAt] = useState<number>(0);
  const [flipMs, setFlipMs] = useState(0);
  const [search, setSearch] = useState('');
  const [importText, setImportText] = useState('');
  const dueCards = useMemo(() => cards.filter((c) => new Date(c.dueAt) <= new Date()), [cards]);

  const activeCard = session?.queue[0] ? cards.find((c) => c.id === session.queue[0]) : undefined;

  async function refreshCards() {
    setCards(await db.cards.toArray());
  }

  useEffect(() => {
    void (async () => {
      setSettings(await loadSettings());
      await refreshCards();
    })();
  }, []);

  useEffect(() => {
    if (activeCard && !showBack) {
      setFrontStartedAt(performance.now());
    }
  }, [activeCard?.id, showBack]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (screen !== 'review' || !activeCard) return;
      if (!showBack && e.key === 'Enter') {
        setFlipMs(performance.now() - frontStartedAt);
        setShowBack(true);
      } else if (showBack && e.code === 'Space') {
        e.preventDefault();
        void handleGrade(true);
      } else if (showBack && e.key.toLowerCase() === 'v') {
        void handleGrade(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, activeCard, showBack, frontStartedAt, session, cards, settings]);

  async function beginReview() {
    const nowDue = cards.filter((c) => new Date(c.dueAt) <= new Date());
    setSession(initializeSession(nowDue));
    setShowBack(false);
    setScreen('review');
  }

  async function handleGrade(correct: boolean) {
    if (!activeCard || !session) return;
    const state = session.cardState[activeCard.id];
    const statusBefore = activeCard.status;
    let nextStatus = statusBefore;
    let fastEligible = false;
    const answerMs = Math.round(flipMs);

    if (correct) {
      const threshold = activeCard.status >= settings.infiniteRule.startStep
        ? settings.infiniteRule.fastThresholdSec
        : settings.steps.find((s) => s.step === activeCard.status)?.speedThresholdSec ?? 1;
      fastEligible = isFastEligible(state.wasWrongThisSession, answerMs / 1000, threshold);
      nextStatus = nextStatusOnCorrect(statusBefore, fastEligible, settings);
    } else {
      nextStatus = statusOnWrong(statusBefore, settings);
    }

    const updated: Card = {
      ...activeCard,
      status: nextStatus,
      lastReviewedAt: new Date().toISOString(),
      lastAnswerMs: answerMs,
      dueAt: correct
        ? new Date(Date.now() + getIntervalHoursForStatus(nextStatus, settings) * 3600 * 1000).toISOString()
        : activeCard.dueAt,
      streak: correct ? activeCard.streak + 1 : 0,
      lapses: correct ? activeCard.lapses : activeCard.lapses + 1,
      updatedAt: new Date().toISOString()
    };

    const nextSession = correct ? markCorrect(session, activeCard.id) : markWrong(session, activeCard.id);
    setSession(nextSession);
    await db.cards.put(updated);

    const review: Review = {
      id: uuidv4(),
      cardId: activeCard.id,
      reviewedAt: new Date().toISOString(),
      answerMs,
      resultType: correct ? 'correct' : 'wrong',
      statusBefore,
      statusAfter: nextStatus,
      attemptNumber: state.attemptsThisSession + 1,
      fastEligible
    };
    await db.reviews.add(review);
    await refreshCards();

    setShowBack(false);
    if (nextSession.queue.length === 0) {
      setScreen('home');
      setSession(null);
    }
  }

  async function applyImport() {
    const parsed = importText.trim().startsWith('[')
      ? (JSON.parse(importText) as Array<Pick<Card, 'characters' | 'pinyin' | 'meaning'>>)
      : parseCsv(importText);
    const now = new Date().toISOString();
    for (const row of parsed) {
      const existing = await db.cards.where('characters').equals(row.characters).first();
      if (existing && settings.dedupeImportMode === 'merge') {
        await db.cards.put({ ...existing, ...row, updatedAt: now });
      } else {
        await db.cards.add(makeCard(row));
      }
    }
    setImportText('');
    await refreshCards();
  }

  function exportCards(filtered: boolean, asJson: boolean) {
    const items = filtered ? dueCards : cards;
    if (asJson) {
      downloadText('cards.json', JSON.stringify(items, null, 2), 'application/json');
    } else {
      downloadText('cards.csv', toCsv(items), 'text/csv');
    }
  }

  async function updateSettings(next: Settings) {
    if (
      next.frontFields.length < 1 ||
      next.frontFields.length > 2 ||
      next.backFields.length < 1 ||
      next.backFields.length > 2 ||
      JSON.stringify(next.frontFields) === JSON.stringify(next.backFields)
    ) return;
    setSettings(next);
    await saveSettings(next);
  }

  function pronounce(card: Card) {
    const utter = new SpeechSynthesisUtterance(card.characters || card.pinyin || '');
    const voices = speechSynthesis.getVoices();
    utter.voice = voices.find((v) => v.name === settings.ttsVoiceName) ?? null;
    utter.rate = settings.ttsRate;
    utter.pitch = settings.ttsPitch;
    speechSynthesis.speak(utter);
  }

  const filteredCards = cards.filter((c) => `${c.characters} ${c.pinyin ?? ''} ${c.meaning}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="app">
      <header>
        <h1>Flash Character SRS</h1>
        <nav>{(['home', 'review', 'cards', 'import', 'settings', 'print'] as Screen[]).map((s) => <button key={s} onClick={() => setScreen(s)}>{s}</button>)}</nav>
      </header>

      {screen === 'home' && <section><h2>Dashboard</h2><p>Total: {cards.length}</p><p>Due: {dueCards.length}</p><button onClick={beginReview} disabled={!dueCards.length}>Start Review</button></section>}

      {screen === 'review' && <section><h2>Review</h2>{activeCard ? <div className="card"><p>Queue left: {session?.queue.length}</p>{!showBack ? <>
            {settings.frontFields.map((f) => <div key={f} className={f === 'characters' ? 'characters-text' : ''}>{fieldText(activeCard, f)}</div>)}
            <p>Timer: {(Math.max(0, performance.now() - frontStartedAt) / 1000).toFixed(2)}s</p>
            <button onClick={() => { setFlipMs(performance.now() - frontStartedAt); setShowBack(true); }}>Flip (Enter)</button>
          </> : <>
            {settings.backFields.map((f) => <div key={f} className={f === 'characters' ? 'characters-text' : ''}>{fieldText(activeCard, f)}</div>)}
            <p>Flip time: {(flipMs / 1000).toFixed(2)}s</p>
            <button onClick={() => void handleGrade(true)}>Correct (Space)</button>
            <button onClick={() => void handleGrade(false)}>Wrong (V)</button>
            <button onClick={() => pronounce(activeCard)}>🔊 Pronounce</button>
          </>}</div> : <p>No active card.</p>}</section>}

      {screen === 'cards' && <section><h2>Card Manager</h2><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" />
        <table><thead><tr><th>Characters</th><th>Pinyin</th><th>Meaning</th><th>Status</th></tr></thead><tbody>{filteredCards.map((c) => <tr key={c.id}><td>{c.characters}</td><td>{c.pinyin}</td><td>{c.meaning}</td><td>{c.status}</td></tr>)}</tbody></table></section>}

      {screen === 'import' && <section><h2>Import / Export</h2><textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="characters,pinyin,meaning" rows={8} />
        <button onClick={() => void applyImport()}>Import CSV/Paste</button>
        <button onClick={() => exportCards(false, false)}>Export CSV (all)</button>
        <button onClick={() => exportCards(true, false)}>Export CSV (due)</button>
        <button onClick={() => exportCards(false, true)}>Export JSON (all)</button>
        <button onClick={() => exportCards(true, true)}>Export JSON (due)</button>
      </section>}

      {screen === 'settings' && <section><h2>Settings</h2>
        <label>Wrong behavior
          <select value={settings.wrongBehavior} onChange={(e) => void updateSettings({ ...settings, wrongBehavior: e.target.value as Settings['wrongBehavior'] })}>
            <option value="none">No lapse on wrong</option><option value="lapseOne">Lapse one</option><option value="resetZero">Reset to zero</option>
          </select>
        </label>
        <label>Front Fields
          <input value={settings.frontFields.join(',')} onChange={(e) => void updateSettings({ ...settings, frontFields: e.target.value.split(',').map((v) => v.trim() as CardField).filter(Boolean) })} />
        </label>
        <label>Back Fields
          <input value={settings.backFields.join(',')} onChange={(e) => void updateSettings({ ...settings, backFields: e.target.value.split(',').map((v) => v.trim() as CardField).filter(Boolean) })} />
        </label>
        <h3>SRS Steps</h3>
        <table><thead><tr><th>Step</th><th>Interval(h)</th><th>Threshold(s)</th><th>Slow mode</th></tr></thead><tbody>
          {settings.steps.map((step, idx) => <tr key={step.step}>
            <td>{step.step}</td>
            <td><input type="number" value={step.intervalHours} onChange={(e) => {
              const copy = [...settings.steps];
              copy[idx] = { ...step, intervalHours: Number(e.target.value) };
              void updateSettings({ ...settings, steps: copy });
            }} /></td>
            <td><input type="number" value={Number.isFinite(step.speedThresholdSec) ? step.speedThresholdSec : 9999} onChange={(e) => {
              const copy = [...settings.steps];
              copy[idx] = { ...step, speedThresholdSec: Number(e.target.value) };
              void updateSettings({ ...settings, steps: copy });
            }} /></td>
            <td><select value={step.slowCorrectCapMode} onChange={(e) => {
              const copy = [...settings.steps];
              copy[idx] = { ...step, slowCorrectCapMode: e.target.value as typeof step.slowCorrectCapMode };
              void updateSettings({ ...settings, steps: copy });
            }}><option value="stay">stay</option><option value="demoteOne">demoteOne</option><option value="custom">custom</option></select></td>
          </tr>)}
        </tbody></table>
        <h3>Infinite Rule</h3>
        <label>Start step <input type="number" value={settings.infiniteRule.startStep} onChange={(e) => void updateSettings({ ...settings, infiniteRule: { ...settings.infiniteRule, startStep: Number(e.target.value) } })} /></label>
        <label>Fast threshold sec <input type="number" value={settings.infiniteRule.fastThresholdSec} onChange={(e) => void updateSettings({ ...settings, infiniteRule: { ...settings.infiniteRule, fastThresholdSec: Number(e.target.value) } })} /></label>
        <label>Base interval days <input type="number" value={settings.infiniteRule.baseIntervalDays} onChange={(e) => void updateSettings({ ...settings, infiniteRule: { ...settings.infiniteRule, baseIntervalDays: Number(e.target.value) } })} /></label>
        <label>Growth factor <input type="number" step={0.1} value={settings.infiniteRule.growthFactor} onChange={(e) => void updateSettings({ ...settings, infiniteRule: { ...settings.infiniteRule, growthFactor: Number(e.target.value) } })} /></label>
        <label>Max interval days <input type="number" value={settings.infiniteRule.maxIntervalDays} onChange={(e) => void updateSettings({ ...settings, infiniteRule: { ...settings.infiniteRule, maxIntervalDays: Number(e.target.value) } })} /></label>
        <label>TTS rate <input type="number" value={settings.ttsRate} step={0.1} onChange={(e) => void updateSettings({ ...settings, ttsRate: Number(e.target.value) })} /></label>
        <label>TTS pitch <input type="number" value={settings.ttsPitch} step={0.1} onChange={(e) => void updateSettings({ ...settings, ttsPitch: Number(e.target.value) })} /></label>
      </section>}

      {screen === 'print' && <section className="print-area"><h2>Print</h2><p>Use browser print to print fronts/backs with IDs.</p>
        <div className="grid">{cards.map((c) => <div className="print-card" key={c.id}><small>{c.id.slice(0, 8)}</small><strong>{c.characters}</strong><div>{c.pinyin}</div><div>{c.meaning}</div></div>)}</div>
      </section>}
    </div>
  );
}
