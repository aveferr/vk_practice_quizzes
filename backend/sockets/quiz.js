const jwt = require('jsonwebtoken');
const pool = require('../db');

const BASE_SCORE = 1000;
const MIN_SCORE = 100;

// sessionId -> { quizId, hostId, questions, currentIndex, timeLimitMs, questionStartedAt, timer, locked, navigating }
const liveSessions = new Map();

function roomName(sessionId) {
  return `session:${sessionId}`;
}

function sanitizeQuestion(question) {
  return {
    id: question.id,
    order_index: question.order_index,
    question_text: question.question_text,
    image_url: question.image_url,
    type: question.type,
    time_limit: question.time_limit,
    options: question.options.map((o) => ({ id: o.id, text: o.text })),
  };
}

async function loadSessionQuestions(quizId) {
  const questionsResult = await pool.query(
    'SELECT * FROM questions WHERE quiz_id = $1 ORDER BY order_index',
    [quizId]
  );
  const questions = questionsResult.rows;
  if (questions.length === 0) return [];

  const optionsResult = await pool.query(
    'SELECT * FROM answer_options WHERE question_id = ANY($1)',
    [questions.map((q) => q.id)]
  );
  const optionsByQuestion = optionsResult.rows.reduce((acc, opt) => {
    (acc[opt.question_id] ||= []).push(opt);
    return acc;
  }, {});

  return questions.map((q) => ({ ...q, options: optionsByQuestion[q.id] || [] }));
}

async function getLeaderboard(sessionId) {
  const result = await pool.query(
    `SELECT p.user_id, u.name, p.total_score
     FROM quiz_session_participants p
     JOIN users u ON u.id = p.user_id
     WHERE p.session_id = $1
     ORDER BY p.total_score DESC`,
    [sessionId]
  );
  return result.rows;
}

async function finalizeQuestion(io, sessionId) {
  const state = liveSessions.get(sessionId);
  if (!state || state.locked) return;
  state.locked = true;
  if (state.timer) clearTimeout(state.timer);

  const question = state.questions[state.currentIndex];
  const correctOptionIds = new Set(question.options.filter((o) => o.is_correct).map((o) => o.id));

  const [participantsResult, allAnswersResult] = await Promise.all([
    pool.query('SELECT user_id FROM quiz_session_participants WHERE session_id = $1', [sessionId]),
    pool.query(
      'SELECT user_id, answer_option_id, answered_at_ms FROM session_answers WHERE session_id = $1 AND question_id = $2',
      [sessionId, question.id]
    ),
  ]);

  const answersByUser = new Map();
  for (const row of allAnswersResult.rows) {
    if (!answersByUser.has(row.user_id)) answersByUser.set(row.user_id, []);
    answersByUser.get(row.user_id).push(row);
  }

  const results = [];
  const bulkUserIds = [];
  const bulkIsCorrect = [];
  const bulkScores = [];
  const bulkAnsweredAt = [];
  const scoreUserIds = [];
  const scoreValues = [];

  for (const { user_id: userId } of participantsResult.rows) {
    const userAnswers = answersByUser.get(userId) ?? [];
    const selectedIds = new Set(userAnswers.map((r) => r.answer_option_id));
    const answeredAtMs = userAnswers.length > 0
      ? userAnswers.reduce((min, r) => Math.min(min, r.answered_at_ms), Infinity)
      : null;

    const isCorrect =
      selectedIds.size === correctOptionIds.size &&
      [...selectedIds].every((id) => correctOptionIds.has(id));

    let scoreEarned = 0;
    if (isCorrect && answeredAtMs !== null) {
      const remainingMs = Math.max(0, state.timeLimitMs - answeredAtMs);
      scoreEarned = Math.max(MIN_SCORE, Math.round(BASE_SCORE * (remainingMs / state.timeLimitMs)));
    }

    bulkUserIds.push(userId);
    bulkIsCorrect.push(isCorrect);
    bulkScores.push(scoreEarned);
    bulkAnsweredAt.push(answeredAtMs);
    if (scoreEarned > 0) {
      scoreUserIds.push(userId);
      scoreValues.push(scoreEarned);
    }

    results.push({ user_id: userId, is_correct: isCorrect, score_earned: scoreEarned });
  }

  if (bulkUserIds.length > 0) {
    await pool.query(
      `INSERT INTO session_question_results (session_id, user_id, question_id, is_correct, score_earned, answered_at_ms)
       SELECT $1, u, $2, c, s, t
       FROM unnest($3::uuid[], $4::boolean[], $5::integer[], $6::integer[]) AS x(u, c, s, t)
       ON CONFLICT (session_id, user_id, question_id) DO NOTHING`,
      [sessionId, question.id, bulkUserIds, bulkIsCorrect, bulkScores, bulkAnsweredAt]
    );
  }

  if (scoreUserIds.length > 0) {
    await pool.query(
      `UPDATE quiz_session_participants AS p
       SET total_score = total_score + v.score
       FROM unnest($1::uuid[], $2::integer[]) AS v(user_id, score)
       WHERE p.session_id = $3 AND p.user_id = v.user_id`,
      [scoreUserIds, scoreValues, sessionId]
    );
  }

  const leaderboard = await getLeaderboard(sessionId);
  io.to(roomName(sessionId)).emit('question_ended', {
    question_id: question.id,
    correct_option_ids: [...correctOptionIds],
    results,
    leaderboard,
  });
}

async function startQuestion(io, sessionId, index) {
  const state = liveSessions.get(sessionId);
  const question = state.questions[index];

  state.currentIndex = index;
  state.locked = false;
  state.navigating = false;
  state.timeLimitMs = question.time_limit * 1000;
  state.questionStartedAt = Date.now();

  await pool.query('UPDATE quiz_sessions SET current_question_index = $1 WHERE id = $2', [index, sessionId]);

  io.to(roomName(sessionId)).emit('question_started', {
    question: sanitizeQuestion(question),
    index,
    total: state.questions.length,
    time_limit: question.time_limit,
    server_time: Date.now(),
  });

  state.timer = setTimeout(() => {
    finalizeQuestion(io, sessionId).catch((err) => console.error('Ошибка завершения вопроса:', err.message));
  }, state.timeLimitMs);
}

function attachQuizSocket(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Не авторизован'));
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Недействительный токен'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join_room', async ({ room_code }, callback) => {
      try {
        const sessionResult = await pool.query(
          "SELECT * FROM quiz_sessions WHERE room_code = $1 AND status != 'finished'",
          [room_code]
        );
        const session = sessionResult.rows[0];
        if (!session) return callback?.({ error: 'Комната не найдена' });

        // Защита от двойного join — если сокет уже в этой комнате, просто возвращаем состояние
        if (socket.sessionId === session.id) {
          const activeState = liveSessions.get(session.id);
          let activeQuestion = null;
          if (session.status === 'active' && activeState && !activeState.locked) {
            const q = activeState.questions[activeState.currentIndex];
            activeQuestion = {
              question: sanitizeQuestion(q),
              index: activeState.currentIndex,
              total: activeState.questions.length,
              time_limit: q.time_limit,
            };
          }
          return callback?.({
            session,
            role: session.host_id === socket.user.id ? 'host' : 'participant',
            leaderboard: await getLeaderboard(session.id),
            activeQuestion,
          });
        }

        // Если сокет ранее был в другой комнате — покидаем её
        if (socket.sessionId && socket.sessionId !== session.id) {
          socket.leave(roomName(socket.sessionId));
          socket.sessionId = null;
        }

        socket.sessionId = session.id;
        socket.join(roomName(session.id));

        const isHost = session.host_id === socket.user.id;

        if (!isHost) {
          // ON CONFLICT DO NOTHING — безопасно при переподключении
          const insertResult = await pool.query(
            `INSERT INTO quiz_session_participants (session_id, user_id)
             VALUES ($1, $2) ON CONFLICT (session_id, user_id) DO NOTHING
             RETURNING user_id`,
            [session.id, socket.user.id]
          );
          // Рассылаем leaderboard_update только если участник зашёл впервые
          if (insertResult.rowCount > 0) {
            io.to(roomName(session.id)).emit('leaderboard_update', await getLeaderboard(session.id));
          }
        }

        // Если квиз уже активен, но сессия не в liveSessions (сервер перезапускался) —
        // восстанавливаем состояние из БД чтобы участник мог продолжить
        if (session.status === 'active' && !liveSessions.has(session.id)) {
          const questions = await loadSessionQuestions(session.quiz_id);
          if (questions.length > 0) {
            const idx = session.current_question_index ?? 0;
            liveSessions.set(session.id, {
              quizId: session.quiz_id,
              hostId: session.host_id,
              questions,
              currentIndex: idx,
              timeLimitMs: questions[idx].time_limit * 1000,
              questionStartedAt: Date.now(), // точное время потеряно, но квиз не зависнет
              timer: null,
              locked: true, // не даём отвечать — вопрос будет завершён хостом вручную
            });
            console.log(`[quiz] Сессия ${session.id} восстановлена из БД после перезапуска`);
          }
        }

        let activeQuestion = null;
        if (session.status === 'active') {
          const activeState = liveSessions.get(session.id);
          if (activeState && !activeState.locked) {
            const q = activeState.questions[activeState.currentIndex];
            activeQuestion = {
              question: sanitizeQuestion(q),
              index: activeState.currentIndex,
              total: activeState.questions.length,
              time_limit: q.time_limit,
            };
          }
        }

        callback?.({
          session,
          role: isHost ? 'host' : 'participant',
          leaderboard: await getLeaderboard(session.id),
          activeQuestion,
        });
      } catch (err) {
        console.error('Ошибка подключения к комнате:', err.message);
        callback?.({ error: 'Внутренняя ошибка сервера' });
      }
    });

    socket.on('start_quiz', async (_, callback) => {
      try {
        const sessionId = socket.sessionId;
        const sessionResult = await pool.query('SELECT * FROM quiz_sessions WHERE id = $1', [sessionId]);
        const session = sessionResult.rows[0];
        if (!session) return callback?.({ error: 'Сессия не найдена' });
        if (session.host_id !== socket.user.id) return callback?.({ error: 'Недостаточно прав' });
        if (session.status !== 'waiting') return callback?.({ error: 'Квиз уже запущен' });

        const questions = await loadSessionQuestions(session.quiz_id);
        if (questions.length === 0) return callback?.({ error: 'В квизе нет вопросов' });

        liveSessions.set(sessionId, {
          quizId: session.quiz_id,
          hostId: session.host_id,
          questions,
          currentIndex: -1,
          locked: true,
          navigating: false,
        });

        await pool.query(
          "UPDATE quiz_sessions SET status = 'active', started_at = NOW() WHERE id = $1",
          [sessionId]
        );

        await startQuestion(io, sessionId, 0);
        callback?.({ ok: true });
      } catch (err) {
        console.error('Ошибка запуска квиза:', err.message);
        callback?.({ error: 'Внутренняя ошибка сервера' });
      }
    });

    socket.on('submit_answer', async ({ question_id, option_ids }, callback) => {
      try {
        const sessionId = socket.sessionId;
        const state = liveSessions.get(sessionId);
        if (!state || state.locked) return callback?.({ error: 'Приём ответов закрыт' });

        if (!Array.isArray(option_ids) || option_ids.length === 0) {
          return callback?.({ error: 'Некорректные данные ответа' });
        }

        const currentQuestion = state.questions[state.currentIndex];
        if (currentQuestion.id !== question_id) return callback?.({ error: 'Вопрос уже неактуален' });

        const validOptionIds = new Set(currentQuestion.options.map((o) => o.id));
        if (!option_ids.every((id) => validOptionIds.has(id))) {
          return callback?.({ error: 'Недопустимые варианты ответа' });
        }

        const answeredAtMs = Date.now() - state.questionStartedAt;

        for (const optionId of option_ids) {
          await pool.query(
            `INSERT INTO session_answers (session_id, user_id, question_id, answer_option_id, answered_at_ms)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (session_id, user_id, question_id, answer_option_id) DO NOTHING`,
            [sessionId, socket.user.id, question_id, optionId, answeredAtMs]
          );
        }

        const progressResult = await pool.query(
          `SELECT COUNT(DISTINCT user_id) AS answered FROM session_answers
           WHERE session_id = $1 AND question_id = $2`,
          [sessionId, question_id]
        );
        const totalResult = await pool.query(
          'SELECT COUNT(*) AS total FROM quiz_session_participants WHERE session_id = $1',
          [sessionId]
        );
        io.to(roomName(sessionId)).emit('answer_progress', {
          question_id,
          answered: Number(progressResult.rows[0].answered),
          total: Number(totalResult.rows[0].total),
        });

        callback?.({ ok: true });
      } catch (err) {
        console.error('Ошибка отправки ответа:', err.message);
        callback?.({ error: 'Внутренняя ошибка сервера' });
      }
    });

    socket.on('end_question', async (_, callback) => {
      try {
        const sessionId = socket.sessionId;
        const state = liveSessions.get(sessionId);
        if (!state || state.hostId !== socket.user.id) return callback?.({ error: 'Недостаточно прав' });
        if (state.locked) return callback?.({ error: 'Вопрос уже завершён' });

        await finalizeQuestion(io, sessionId);
        callback?.({ ok: true });
      } catch (err) {
        console.error('Ошибка досрочного завершения вопроса:', err.message);
        callback?.({ error: 'Внутренняя ошибка сервера' });
      }
    });

    socket.on('next_question', async (_, callback) => {
      try {
        const sessionId = socket.sessionId;
        const state = liveSessions.get(sessionId);
        if (!state || state.hostId !== socket.user.id) return callback?.({ error: 'Недостаточно прав' });

        // Защита от двойного нажатия: пока идёт переход — блокируем повторный вызов
        if (state.navigating) return callback?.({ error: 'Переход уже выполняется' });
        state.navigating = true;

        if (!state.locked) {
          await finalizeQuestion(io, sessionId);
        }

        const nextIndex = state.currentIndex + 1;
        if (nextIndex >= state.questions.length) {
          await pool.query(
            "UPDATE quiz_sessions SET status = 'finished', finished_at = NOW() WHERE id = $1",
            [sessionId]
          );
          const leaderboard = await getLeaderboard(sessionId);
          io.to(roomName(sessionId)).emit('quiz_finished', { leaderboard });
          liveSessions.delete(sessionId);
        } else {
          await startQuestion(io, sessionId, nextIndex);
        }
        callback?.({ ok: true });
      } catch (err) {
        console.error('Ошибка перехода к следующему вопросу:', err.message);
        // Сбрасываем флаг при ошибке чтобы не залочить навсегда
        if (liveSessions.has(sessionId)) liveSessions.get(sessionId).navigating = false;
        callback?.({ error: 'Внутренняя ошибка сервера' });
      }
    });
  });
}

module.exports = attachQuizSocket;
