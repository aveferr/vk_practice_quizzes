import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { closeSocket, getSocket } from '../api/socket';
import './RoomPage.css';

const TILE_COLORS = ['red', 'blue', 'amber', 'green'];

export function RoomPage() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState('');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [role, setRole] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);

  const [question, setQuestion] = useState(null);
  const [questionMeta, setQuestionMeta] = useState({ index: 0, total: 0, timeLimit: 0 });
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [progress, setProgress] = useState({ answered: 0, total: 0 });
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [finalLeaderboard, setFinalLeaderboard] = useState([]);
  const [actionError, setActionError] = useState('');

  const questionStartRef = useRef(0);
  const leaderboardRef = useRef([]);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(''), 3000);
    return () => clearTimeout(timer);
  }, [actionError]);

  useEffect(() => {
    let cancelled = false;

    function handleQuestionStarted(data) {
      questionStartRef.current = Date.now();
      setQuestion(data.question);
      setQuestionMeta({ index: data.index, total: data.total, timeLimit: data.time_limit });
      setSecondsLeft(data.time_limit);
      setProgress({ answered: 0, total: leaderboardRef.current.length });
      setSelectedIds([]);
      setSubmitted(false);
      setResultData(null);
      setPhase('question');
    }

    function handleProgress(data) {
      setProgress({ answered: data.answered, total: data.total });
    }

    function handleQuestionEnded(data) {
      setResultData(data);
      leaderboardRef.current = data.leaderboard;
      setLeaderboard(data.leaderboard);
      setPhase('result');
    }

    function handleQuizFinished(data) {
      setFinalLeaderboard(data.leaderboard);
      setPhase('finished');
    }

    function handleLeaderboardUpdate(data) {
      leaderboardRef.current = data;
      setLeaderboard(data);
    }

    async function init() {
      try {
        const session = await api.getSession(token, id);
        if (cancelled) return;
        setSessionInfo(session);

        const socket = getSocket(token);
        socketRef.current = socket;
        socket.on('question_started', handleQuestionStarted);
        socket.on('answer_progress', handleProgress);
        socket.on('question_ended', handleQuestionEnded);
        socket.on('quiz_finished', handleQuizFinished);
        socket.on('leaderboard_update', handleLeaderboardUpdate);

        socket.emit('join_room', { room_code: session.room_code }, (ack) => {
          if (cancelled) return;
          if (ack?.error) {
            setError(ack.error);
            setPhase('error');
            return;
          }
          leaderboardRef.current = ack.leaderboard;
          setRole(ack.role);
          setLeaderboard(ack.leaderboard);

          if (session.status === 'finished') {
            setError('Этот квиз уже завершён');
            setPhase('error');
          } else if (ack.activeQuestion) {
            const { question: q, index, total, time_limit } = ack.activeQuestion;
            questionStartRef.current = Date.now();
            setQuestion(q);
            setQuestionMeta({ index, total, timeLimit: time_limit });
            setSecondsLeft(time_limit);
            setProgress({ answered: 0, total: ack.leaderboard.length });
            setPhase('question');
          } else {
            setPhase('lobby');
          }
        });
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setPhase('error');
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      const socket = socketRef.current;
      if (socket) {
        socket.off('question_started', handleQuestionStarted);
        socket.off('answer_progress', handleProgress);
        socket.off('question_ended', handleQuestionEnded);
        socket.off('quiz_finished', handleQuizFinished);
        socket.off('leaderboard_update', handleLeaderboardUpdate);
      }
      closeSocket();
    };
  }, [id, token]);

  useEffect(() => {
    if (phase !== 'question') return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - questionStartRef.current;
      const remaining = Math.max(0, Math.ceil((questionMeta.timeLimit * 1000 - elapsed) / 1000));
      setSecondsLeft(remaining);
    }, 250);
    return () => clearInterval(interval);
  }, [phase, questionMeta.timeLimit]);

  function emit(event, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) return reject(new Error('Соединение не установлено'));
      socketRef.current.emit(event, payload, (ack) => {
        if (ack?.error) reject(new Error(ack.error));
        else resolve(ack);
      });
    });
  }

  async function handleStartQuiz() {
    try {
      await emit('start_quiz');
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleSelectSingle(optionId) {
    if (submitted) return;
    setSelectedIds([optionId]);
    try {
      await emit('submit_answer', { question_id: question.id, option_ids: [optionId] });
      setSubmitted(true);
    } catch (err) {
      setSelectedIds([]);
      setActionError(err.message);
    }
  }

  function toggleMultiple(optionId) {
    if (submitted) return;
    setSelectedIds((ids) => (ids.includes(optionId) ? ids.filter((i) => i !== optionId) : [...ids, optionId]));
  }

  async function handleSubmitMultiple() {
    try {
      await emit('submit_answer', { question_id: question.id, option_ids: selectedIds });
      setSubmitted(true);
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleEndQuestionEarly() {
    try {
      await emit('end_question');
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleNextQuestion() {
    try {
      await emit('next_question');
    } catch (err) {
      setActionError(err.message);
    }
  }

  function handleReturnHome() {
    navigate(role === 'host' ? '/dashboard' : '/join');
  }

  function renderPhaseContent() {
    if (phase === 'loading') return <div className="room-center">Загрузка…</div>;
    if (phase === 'error') return <div className="room-center room-error">{error}</div>;

    if (phase === 'lobby') {
      return (
        <div className="room-lobby">
          <div className="room-lobby-header">
            <p className="room-lobby-subtitle">
              {sessionInfo.title} · {sessionInfo.question_count} вопросов
            </p>
            <span className="room-live-badge">● В эфире</span>
          </div>
          <div className="room-lobby-body">
            <div className="room-code-card">
              <p className="room-code-label">Код комнаты</p>
              <p className="room-code">{sessionInfo.room_code}</p>
              <p className="room-code-hint">Поделитесь этим кодом с участниками</p>
            </div>
            <div className="room-participants-card">
              <div className="room-participants-header">
                <h3>Участники</h3>
                <span className="badge">{leaderboard.length} подключились</span>
              </div>
              <div className="room-participants-grid">
                {leaderboard.map((p) => (
                  <div className="room-participant-chip" key={p.user_id}>
                    <span className="room-participant-avatar">{(p.name?.[0] ?? '?').toUpperCase()}</span>
                    {p.name}
                  </div>
                ))}
                {leaderboard.length === 0 && <p className="modal-hint">Ожидаем подключения участников…</p>}
              </div>
              {role === 'host' && (
                <button className="btn-success room-start-btn" onClick={handleStartQuiz}>
                  ▶ Начать квиз
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (phase === 'question' && question) {
      const color = (i) => TILE_COLORS[i % TILE_COLORS.length];

      return (
        <div className={`room-question${role === 'host' ? ' host' : ''}`}>
          <div className="room-question-top">
            <span>Вопрос {questionMeta.index + 1} / {questionMeta.total}</span>
            {role === 'host' && <span className="room-question-tag">Вид организатора</span>}
            <span>{progress.answered} / {progress.total || leaderboard.length} ответили</span>
          </div>

          <div className="room-timer">{String(secondsLeft).padStart(2, '0')}</div>

          <div className="room-question-card">
            <p>{question.question_text}</p>
            {question.image_url && <img src={question.image_url} alt="" className="room-question-image" />}
          </div>

          <div className="room-options-grid">
            {question.options.map((opt, i) => {
              const selected = selectedIds.includes(opt.id);
              const clickable = role === 'participant' && !submitted;
              return (
                <button
                  key={opt.id}
                  className={`room-option tile-${color(i)}${selected ? ' selected' : ''}`}
                  disabled={!clickable}
                  onClick={() =>
                    clickable && (question.type === 'single' ? handleSelectSingle(opt.id) : toggleMultiple(opt.id))
                  }
                >
                  {opt.text}
                </button>
              );
            })}
          </div>

          {role === 'participant' && question.type === 'multiple' && !submitted && (
            <button className="btn-primary room-submit-btn" disabled={selectedIds.length === 0} onClick={handleSubmitMultiple}>
              Отправить ответ
            </button>
          )}

          {role === 'participant' && submitted && (
            <div className="room-submitted-card">
              <div className="room-submitted-check">✓</div>
              <strong>Ответ отправлен!</strong>
              <p>Ожидайте, пока остальные ответят…</p>
            </div>
          )}

          {role === 'host' && (
            <div className="room-host-actions">
              <button className="btn-secondary" onClick={handleEndQuestionEarly}>
                Завершить досрочно
              </button>
              <button className="btn-primary" onClick={handleNextQuestion}>
                Следующий вопрос →
              </button>
            </div>
          )}
        </div>
      );
    }

    if (phase === 'result' && resultData && question) {
      const myResult = resultData.results.find((r) => r.user_id === user.id);
      return (
        <div className="room-result">
          <h2>Результаты вопроса</h2>
          <p className="room-lobby-subtitle">
            Вопрос {questionMeta.index + 1} из {questionMeta.total}
          </p>

          <div className="room-result-body">
            <div>
              <h3>Варианты ответов</h3>
              {question.options.map((opt) => {
                const isCorrect = resultData.correct_option_ids.includes(opt.id);
                const wasMine = selectedIds.includes(opt.id);
                const cls = isCorrect ? 'correct' : wasMine ? 'wrong' : '';
                return (
                  <div key={opt.id} className={`room-result-option ${cls}`}>
                    {opt.text}
                    {isCorrect && <span>✓</span>}
                    {!isCorrect && wasMine && <span>✕</span>}
                  </div>
                );
              })}
            </div>

            <div className="room-result-side">
              {role === 'participant' && myResult && (
                <div className="room-score-card">
                  <p className="room-lobby-subtitle">Набрано очков</p>
                  <p className="room-score-value">+{myResult.score_earned}</p>
                  <p className="room-lobby-subtitle">
                    Итого: {leaderboard.find((p) => p.user_id === user.id)?.total_score ?? 0}
                  </p>
                </div>
              )}
              <div className="room-top3-card">
                <p className="room-lobby-subtitle">ТОП-3</p>
                {resultData.leaderboard.slice(0, 3).map((p, i) => (
                  <div className="room-top3-row" key={p.user_id}>
                    <span>{['🥇', '🥈', '🥉'][i]} {p.name}</span>
                    <strong>{p.total_score}</strong>
                  </div>
                ))}
              </div>
              {role === 'host' && (
                <button className="btn-primary room-next-btn" onClick={handleNextQuestion}>
                  Следующий вопрос →
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (phase === 'finished') {
      return (
        <div className="room-finished">
          <h2>🏆 Квиз завершён!</h2>
          <p className="room-lobby-subtitle">
            {sessionInfo?.title} · {sessionInfo?.question_count} вопросов · {finalLeaderboard.length} участников
          </p>

          <div className="room-finished-body">
            <div className="room-podium">
              {finalLeaderboard.slice(0, 3).map((p, i) => (
                <div className={`room-podium-card${i === 0 ? ' first' : ''}`} key={p.user_id}>
                  <span>{['🥇', '🥈', '🥉'][i]}</span>
                  <span className="room-podium-avatar">{(p.name?.[0] ?? '?').toUpperCase()}</span>
                  <strong>{p.name}</strong>
                  <span>{p.total_score}</span>
                </div>
              ))}
            </div>

            <div className="room-all-participants">
              <h3>Все участники</h3>
              {finalLeaderboard.map((p, i) => (
                <div className="room-participant-row" key={p.user_id}>
                  <span>#{i + 1}</span>
                  <span className="room-participant-avatar">{(p.name?.[0] ?? '?').toUpperCase()}</span>
                  <span>{p.name}</span>
                  <strong>{p.total_score}</strong>
                </div>
              ))}
            </div>
          </div>

          <button className="btn-primary room-return-btn" onClick={handleReturnHome}>
            Вернуться на главную
          </button>
        </div>
      );
    }

    return null;
  }

  return (
    <>
      {renderPhaseContent()}
      {actionError && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--clr-danger, #c0392b)', color: '#fff',
          padding: '0.6rem 1.4rem', borderRadius: '0.5rem', zIndex: 9999,
          fontSize: '0.9rem', pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {actionError}
        </div>
      )}
    </>
  );
}
