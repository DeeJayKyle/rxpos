import { useMemo, useState } from 'react';
import { GraduationCap, Sparkles, CheckCircle2, XCircle, Trophy, RotateCcw, Loader2, WifiOff } from 'lucide-react';
import { useStore, uid, now, put, today } from '../store.jsx';
import { Empty } from '../ui.jsx';
import { toast } from '../feedback.jsx';
import { aiQuiz } from '../cloud.js';

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const genericOf = (p) => String(p.generic || '').trim();

/** Offline questions from the pharmacy's own medicine list (brand ↔ generic, formulation) */
function offlineQuiz(stock, all, n = 8) {
  const withGeneric = stock.filter((p) => genericOf(p) && genericOf(p).toLowerCase() !== p.name.toLowerCase());
  const pool = shuffle(withGeneric).slice(0, n);
  const otherGenerics = [...new Set(all.map(genericOf).filter(Boolean))];
  const otherForms = [...new Set(all.map((p) => p.form).filter(Boolean))];
  return pool.map((p, i) => {
    const kind = i % 3;
    if (kind === 1 && p.form) {
      const opts = shuffle([p.form, ...shuffle(otherForms.filter((f) => f !== p.form)).slice(0, 3)]);
      return { q: `What formulation is ${p.name}?`, options: opts, answer: opts.indexOf(p.form), explain: `${p.name} is ${p.form.toLowerCase()} (${genericOf(p)}).` };
    }
    if (kind === 2) {
      const brands = shuffle(stock.filter((x) => genericOf(x) && genericOf(x) !== genericOf(p))).slice(0, 3).map((x) => x.name);
      if (brands.length === 3) { const opts = shuffle([p.name, ...brands]); return { q: `Which of these contains ${genericOf(p)}?`, options: opts, answer: opts.indexOf(p.name), explain: `${p.name} contains ${genericOf(p)}.` }; }
    }
    const opts = shuffle([genericOf(p), ...shuffle(otherGenerics.filter((g) => g.toLowerCase() !== genericOf(p).toLowerCase())).slice(0, 3)]);
    return { q: `What is the generic name (active ingredient) of ${p.name}?`, options: opts, answer: opts.indexOf(genericOf(p)), explain: `${p.name} = ${genericOf(p)}.` };
  }).filter((x) => x.answer >= 0 && x.options.length === 4);
}

export default function Quiz() {
  const { db, products, update, user, syncCfg, features } = useStore();
  const [quiz, setQuiz] = useState(null); // { questions, i, picked: [], source }
  const [busy, setBusy] = useState(false);
  const stock = useMemo(() => products.filter((p) => p.stock > 0), [products]);
  const base = stock.length >= 8 ? stock : products;

  const start = async (useAi) => {
    setBusy(true);
    try {
      let questions, source = 'Your medicine list';
      if (useAi) {
        const drugs = [...new Set(shuffle(base).map(genericOf).filter((g) => g && g.length > 3))].slice(0, 8);
        const j = await aiQuiz(syncCfg, drugs, 8);
        questions = j.questions; source = 'AI (Mistral) about medicines in your stock';
      } else questions = offlineQuiz(base, products, 8);
      if (!questions.length) throw new Error('Not enough medicines with generic names to make a quiz yet.');
      setQuiz({ questions, i: 0, picked: [], source });
    } catch (e) { toast(e.message + (useAi ? ' Using the offline quiz instead.' : ''), 'warn'); if (useAi) { setBusy(false); return start(false); } }
    finally { setBusy(false); }
  };
  const answer = (k) => { if (quiz.picked[quiz.i] != null) return; const picked = [...quiz.picked]; picked[quiz.i] = k; setQuiz({ ...quiz, picked }); };
  const next = () => {
    if (quiz.i + 1 < quiz.questions.length) return setQuiz({ ...quiz, i: quiz.i + 1 });
    const score = quiz.questions.filter((q, i) => quiz.picked[i] === q.answer).length;
    update((d) => { put(d, 'quizResults', { id: uid(), date: now(), userId: user.id, userName: user.name, score, total: quiz.questions.length, source: quiz.source }); });
    setQuiz({ ...quiz, done: true, score });
  };
  const month = today().slice(0, 7);
  const board = useMemo(() => {
    const m = new Map();
    for (const r of db.quizResults.filter((x) => String(x.date).slice(0, 7) === month)) { const e = m.get(r.userId) || { name: r.userName, score: 0, total: 0, n: 0 }; e.score += r.score; e.total += r.total; e.n++; m.set(r.userId, e); }
    return [...m.values()].sort((a, b) => b.score / b.total - a.score / a.total || b.n - a.n);
  }, [db.quizResults, month]);

  const q = quiz && !quiz.done ? quiz.questions[quiz.i] : null;
  const picked = quiz?.picked[quiz?.i];
  return (
    <div className="page">
      <div className="page-head"><div><h1>Drug quiz</h1><div className="sub">Short quizzes about the medicines you stock. See the right answers and climb the team board.</div></div></div>
      <div className="grid2">
        <div className="card stack quiz">
          {!quiz && (
            <div className="scan-start">
              <GraduationCap size={48} />
              <p className="muted">8 questions · about 3 minutes</p>
              <div className="row gap wrap">
                {features.ai !== false && <button className="btn primary big" disabled={busy || !navigator.onLine} onClick={() => start(true)}>{busy ? <Loader2 size={18} className="spin" /> : <Sparkles size={18} />}AI quiz: uses, side effects, counselling</button>}
                <button className="btn ghost" disabled={busy} onClick={() => start(false)}><WifiOff size={16} />Quick quiz (works offline)</button>
              </div>
            </div>
          )}
          {q && (
            <>
              <div className="row between"><span className="muted small">Question {quiz.i + 1} of {quiz.questions.length}</span><span className="muted small">{quiz.source}</span></div>
              <div className="quiz-progress"><i style={{ width: `${(quiz.i / quiz.questions.length) * 100}%` }} /></div>
              <h2 className="quiz-q">{q.q}</h2>
              <div className="quiz-options">
                {q.options.map((o, k) => (
                  <button key={k} className={'quiz-opt' + (picked != null ? (k === q.answer ? ' right' : k === picked ? ' wrong' : ' dim') : '')} onClick={() => answer(k)}>
                    <b>{'ABCD'[k]}</b><span>{o}</span>{picked != null && k === q.answer && <CheckCircle2 size={18} />}{picked === k && k !== q.answer && <XCircle size={18} />}
                  </button>
                ))}
              </div>
              {picked != null && <div className={'notice ' + (picked === q.answer ? 'ok' : 'warn')}>{picked === q.answer ? 'Correct! ' : `The right answer is ${'ABCD'[q.answer]}: ${q.options[q.answer]}. `}{q.explain}</div>}
              <div className="form-actions"><button className="btn primary" disabled={picked == null} onClick={next}>{quiz.i + 1 < quiz.questions.length ? 'Next question' : 'See my score'}</button></div>
            </>
          )}
          {quiz?.done && (
            <div className="stack">
              <div className="quiz-score"><Trophy size={36} /><strong>{quiz.score} / {quiz.questions.length}</strong><span className="muted">{quiz.score === quiz.questions.length ? 'Perfect!' : quiz.score >= quiz.questions.length * 0.7 ? 'Well done!' : 'Keep learning. Review the answers below.'}</span></div>
              <h3>Answers</h3>
              {quiz.questions.map((x, i) => (
                <div key={i} className={'rx-line ' + (quiz.picked[i] === x.answer ? 'ok' : 'danger')}>
                  <strong>{i + 1}. {x.q}</strong>
                  <small>Right answer: <b>{x.options[x.answer]}</b>{quiz.picked[i] !== x.answer && <> · you chose {x.options[quiz.picked[i]]}</>}</small>
                  <small className="muted">{x.explain}</small>
                </div>
              ))}
              <button className="btn primary" onClick={() => setQuiz(null)}><RotateCcw size={16} />Another quiz</button>
            </div>
          )}
          <p className="muted small">Questions are for learning. Always confirm clinical details in Drug Information or the BNF / WHO references.</p>
        </div>
        <div className="card">
          <h3><Trophy size={17} />Team board · this month</h3>
          <table>
            <thead><tr><th>#</th><th>Name</th><th className="num">Quizzes</th><th className="num">Score</th></tr></thead>
            <tbody>
              {board.map((b, i) => <tr key={b.name + i}><td>{i + 1}</td><td>{b.name}</td><td className="num">{b.n}</td><td className="num">{Math.round((b.score / b.total) * 100)}%</td></tr>)}
              {!board.length && <Empty colSpan={4}>No quizzes yet this month</Empty>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
