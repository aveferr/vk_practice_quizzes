const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

async function getOwnedQuiz(quizId, userId) {
  const result = await pool.query('SELECT * FROM quizzes WHERE id = $1', [quizId]);
  const quiz = result.rows[0];
  if (!quiz) return { quiz: null, owned: false };
  return { quiz, owned: quiz.author_id === userId };
}

// Создать квиз
router.post('/', requireAuth, requireRole('organizer'), async (req, res) => {
  const { title, category, time_per_question } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Название квиза обязательно' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO quizzes (author_id, title, category, time_per_question)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, title, category || null, time_per_question || 30]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка создания квиза:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Список своих квизов (организатор)
router.get('/', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM quizzes WHERE author_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка получения квизов:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Квиз с вопросами и вариантами ответов (только владелец)
router.get('/:id', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const { quiz, owned } = await getOwnedQuiz(req.params.id, req.user.id);
    if (!quiz) return res.status(404).json({ error: 'Квиз не найден' });
    if (!owned) return res.status(403).json({ error: 'Недостаточно прав' });

    const questions = await pool.query(
      'SELECT * FROM questions WHERE quiz_id = $1 ORDER BY order_index',
      [quiz.id]
    );
    const questionIds = questions.rows.map((q) => q.id);

    let optionsByQuestion = {};
    if (questionIds.length > 0) {
      const options = await pool.query(
        'SELECT * FROM answer_options WHERE question_id = ANY($1)',
        [questionIds]
      );
      optionsByQuestion = options.rows.reduce((acc, opt) => {
        (acc[opt.question_id] ||= []).push(opt);
        return acc;
      }, {});
    }

    res.json({
      ...quiz,
      questions: questions.rows.map((q) => ({
        ...q,
        options: optionsByQuestion[q.id] || [],
      })),
    });
  } catch (err) {
    console.error('Ошибка получения квиза:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Обновить настройки квиза
router.put('/:id', requireAuth, requireRole('organizer'), async (req, res) => {
  const { title, category, time_per_question } = req.body;

  try {
    const { quiz, owned } = await getOwnedQuiz(req.params.id, req.user.id);
    if (!quiz) return res.status(404).json({ error: 'Квиз не найден' });
    if (!owned) return res.status(403).json({ error: 'Недостаточно прав' });

    const result = await pool.query(
      `UPDATE quizzes SET title = $1, category = $2, time_per_question = $3
       WHERE id = $4 RETURNING *`,
      [title ?? quiz.title, category !== undefined ? (category || null) : quiz.category, time_per_question ?? quiz.time_per_question, quiz.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка обновления квиза:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Удалить квиз
router.delete('/:id', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const { quiz, owned } = await getOwnedQuiz(req.params.id, req.user.id);
    if (!quiz) return res.status(404).json({ error: 'Квиз не найден' });
    if (!owned) return res.status(403).json({ error: 'Недостаточно прав' });

    await pool.query('DELETE FROM quizzes WHERE id = $1', [quiz.id]);
    res.status(204).end();
  } catch (err) {
    console.error('Ошибка удаления квиза:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = { router, getOwnedQuiz };
