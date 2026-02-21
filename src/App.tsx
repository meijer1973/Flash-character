import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db, loadSettings, saveSettings } from './lib/db';
import { downloadText, makeCard, parseCsv, toCsv } from './lib/io';
import { defaultSettings, getIntervalHoursForStatus, isFastEligible, nextStatusOnCorrect, statusOnWrong } from './lib/srs';
import { initializeSession, markCorrect, markWrong, SessionState } from './lib/session';
import { Card, CardField, HanziFontKey, Review, Settings } from './lib/types';
import { seedDemoCardsIfEmpty } from './lib/seed';
import './styles.css';

type Screen = 'home' | 'review' | 'cards' | 'import' | 'settings' | 'print';
type ReviewFeedback = 'correct' | 'wrong' | null;

const screenLabels: Record<Screen, string> = {
  home: '首页',
  review: '复习',
  cards: '卡片',
  import: '导入',
  settings: '设置',
  print: '打印'
};

const hanziFontOptions: Array<{ key: HanziFontKey; label: string; className: string }> = [
  { key: 'mashanzheng', label: 'Ma Shan Zheng', className: 'hanzi-font-mashanzheng' },
  { key: 'notoSans', label: 'Noto Sans SC', className: 'hanzi-font-notoSans' },
  { key: 'huxiaobo', label: '胡晓波香辣体', className: 'hanzi-font-huxiaobo' },
  { key: 'aaManhuajia', label: 'Aa漫画家', className: 'hanzi-font-aaManhuajia' },
  { key: 'bananaBrush', label: '香蕉宽毛刷灵感体', className: 'hanzi-font-bananaBrush' },
  { key: 'zihunJianqi', label: '字魂剑气手书', className: 'hanzi-font-zihunJianqi' }
];

function fieldText(card: Card, field: CardField): string {
  return card[field] ?? '';
}

function splitFields(fields: CardField[], card: Card, hanziClassName?: string) {
  return fields.map((field) => (
    <p key={field} className={`field field-${field} ${field === 'characters' ? hanziClassName ?? '' : ''}`.trim()}>
      {fieldText(card, field)}
    </p>
  ));
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [cards, setCards] = useState<Card[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [session, setSession] = useState<SessionState | null>(null);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [frontStartedAt, setFrontStartedAt] = useState<number>(0);
  const [flipMs, setFlipMs] = useState(0);
  const [search, setSearch] = useState('');
  const [importText, setImportText] = useState('');
  const [reviewCount, setReviewCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [feedback, setFeedback] = useState<ReviewFeedback>(null);
  const [showFastBadge, setShowFastBadge] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'));
  const [demoSeeded, setDemoSeeded] = useState(false);

  const dueCards = useMemo(() => cards.filter((c) => new Date(c.dueAt) <= new Date()), [cards]);
  const activeCard = session?.queue[0] ? cards.find((c) => c.id === session.queue[0]) : undefined;
  const reviewedInSession = sessionTotal - (session?.queue.length ?? sessionTotal);
  const progressPercent = sessionTotal ? Math.round((reviewedInSession / sessionTotal) * 100) : 0;
  const accuracyPercent = reviewCount ? Math.round((correctCount / reviewCount) * 100) : 0;
  const backFieldsWithCharacters: CardField[] = ['characters', ...settings.backFields.filter((field) => field !== 'characters')];
  const selectedHanziFontClass = hanziFontOptions.find((option) => option.key === settings.hanziFontKey)?.className ?? 'hanzi-font-mashanzheng';

  async function refreshCards() {
    setCards(await db.cards.toArray());
  }

  async function refreshStats() {
    const reviews = await db.reviews.toArray();
    setReviewCount(reviews.length);
    setCorrectCount(reviews.filter((r) => r.resultType === 'correct').length);
    let running = 0;
    let max = 0;
    for (const review of reviews.sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt))) {
      running = review.resultType === 'correct' ? running + 1 : 0;
      max = Math.max(max, running);
    }
    setBestStreak(max);
  }

  useEffect(() => {
    void (async () => {
      const seeded = await seedDemoCardsIfEmpty();
      setDemoSeeded(seeded);
      setSettings(await loadSettings());
      await refreshCards();
      await refreshStats();
    })();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (activeCard && !showBack) {
      setFrontStartedAt(performance.now());
      setFeedback(null);
      setShowFastBadge(false);
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

  function beginReview() {
    const nowDue = cards.filter((c) => new Date(c.dueAt) <= new Date());
    setSession(initializeSession(nowDue));
    setSessionTotal(nowDue.length);
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
    setFeedback(correct ? 'correct' : 'wrong');
    setShowFastBadge(correct && fastEligible);

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
    await refreshStats();

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
    <div className="app-shell">
      <div className="app-container">
        <header className="app-header">
          <h1>Flash Character SRS</h1>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
            </button>
          </div>
          <nav className="tabbar" role="tablist" aria-label="主导航">
            {(['home', 'review', 'cards', 'import', 'settings', 'print'] as Screen[]).map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={screen === s}
                aria-current={screen === s ? 'page' : undefined}
                className={`tab ${screen === s ? 'active' : ''}`}
                onClick={() => setScreen(s)}
              >
                {screenLabels[s]}
              </button>
            ))}
          </nav>
        </header>


        {demoSeeded && <div className="seed-banner">Demo deck loaded. You can delete it anytime.</div>}

        {screen === 'home' && <section className="panel"><h2>Dashboard</h2>
          <div className="stats-grid">
            <div><span>Total cards</span><strong>{cards.length}</strong></div>
            <div><span>Due now</span><strong>{dueCards.length}</strong></div>
            <div><span>Accuracy</span><strong>{accuracyPercent}%</strong></div>
            <div><span>Total reviews</span><strong>{reviewCount}</strong></div>
            <div><span>Best streak</span><strong>{bestStreak}</strong></div>
          </div>
          <button className="btn btn-primary" onClick={beginReview} disabled={!dueCards.length}>Start Review</button>
        </section>}

        {screen === 'review' && <section className="panel"><h2>Review</h2>{activeCard ? <>
          <div className="progress-head">
            <p>Card {Math.min(reviewedInSession + 1, sessionTotal)} of {sessionTotal}</p>
            <p>{session?.queue.length ?? 0} remaining</p>
          </div>
          <div className="progress-bar"><span style={{ width: `${progressPercent}%` }} /></div>
          <div className={`review-card ${showBack ? 'flipped' : ''} ${feedback === 'correct' ? 'feedback-correct' : ''} ${feedback === 'wrong' ? 'feedback-wrong' : ''}`}>
            {!showBack ? <>
              <div className="review-center">{splitFields(settings.frontFields, activeCard, selectedHanziFontClass)}</div>
              <div className="review-footer">
                <p className="subtle">Timer: {(Math.max(0, performance.now() - frontStartedAt) / 1000).toFixed(2)}s</p>
                <button className="btn btn-primary" onClick={() => { setFlipMs(performance.now() - frontStartedAt); setShowBack(true); }}>Flip (Enter)</button>
              </div>
            </> : <>
              <div className="review-center">{splitFields(backFieldsWithCharacters, activeCard, selectedHanziFontClass)}</div>
              <div className="review-footer">
                <p className="subtle">Flip time: {(flipMs / 1000).toFixed(2)}s</p>
                {showFastBadge && <span className="badge">Fast</span>}
                <div className="action-row">
                  <button className="btn btn-primary" onClick={() => void handleGrade(true)}>Correct (Space)</button>
                  <button className="btn btn-danger" onClick={() => void handleGrade(false)}>Wrong (V)</button>
                  <button className="btn btn-secondary" onClick={() => pronounce(activeCard)}>🔊 Pronounce</button>
                </div>
              </div>
            </>}
          </div>
        </> : <p>No active card.</p>}</section>}

        {screen === 'cards' && <section className="panel"><h2>Card Manager</h2><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" />
          <table><thead><tr><th>Characters</th><th>Pinyin</th><th>Meaning</th><th>Status</th></tr></thead><tbody>{filteredCards.map((c) => <tr key={c.id}><td>{c.characters}</td><td>{c.pinyin}</td><td>{c.meaning}</td><td>{c.status}</td></tr>)}</tbody></table></section>}

        {screen === 'import' && <section className="panel"><h2>Import / Export</h2><textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="characters,pinyin,meaning" rows={8} />
          <div className="action-row">
            <button className="btn btn-primary" onClick={() => void applyImport()}>Import CSV/Paste</button>
            <button className="btn btn-secondary" onClick={() => exportCards(false, false)}>Export CSV (all)</button>
            <button className="btn btn-secondary" onClick={() => exportCards(true, false)}>Export CSV (due)</button>
            <button className="btn btn-secondary" onClick={() => exportCards(false, true)}>Export JSON (all)</button>
            <button className="btn btn-secondary" onClick={() => exportCards(true, true)}>Export JSON (due)</button>
          </div>
        </section>}

        {screen === 'settings' && <section className="panel"><h2>Settings</h2>
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
          <label>TTS rate <input type="number" value={settings.ttsRate} step={0.1} onChange={(e) => void updateSettings({ ...settings, ttsRate: Number(e.target.value) })} /></label>
          <label>TTS pitch <input type="number" value={settings.ttsPitch} step={0.1} onChange={(e) => void updateSettings({ ...settings, ttsPitch: Number(e.target.value) })} /></label>
          <h3>Hanzi Font</h3>
          <div className="font-option-grid" role="radiogroup" aria-label="Hanzi font">
            {hanziFontOptions.map((option) => (
              <button
                type="button"
                role="radio"
                aria-checked={settings.hanziFontKey === option.key}
                aria-pressed={settings.hanziFontKey === option.key}
                key={option.key}
                className={`font-option ${settings.hanziFontKey === option.key ? 'active' : ''}`}
                onClick={() => void updateSettings({ ...settings, hanziFontKey: option.key })}
              >
                <span className="font-option-label">{option.label}</span>
                <span className={`font-option-sample ${option.className}`}>你好 汉字</span>
              </button>
            ))}
          </div>
          <p className="font-option-note">若设备未安装部分字体，将自动使用相近书写风格字体。</p>
        </section>}

        {screen === 'print' && <section className="panel print-area"><h2>Print</h2><p>Use browser print to print fronts/backs with IDs.</p>
          <div className="grid">{cards.map((c) => <div className="print-card" key={c.id}><small className="print-id">{c.id.slice(0, 8)}</small><strong className="print-characters">{c.characters}</strong><div className="print-pinyin">{c.pinyin}</div><div className="print-meaning">{c.meaning}</div></div>)}</div>
        </section>}
      </div>
    </div>
  );
}
