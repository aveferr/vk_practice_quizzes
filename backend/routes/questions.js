const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getOwnedQuiz } = require('./quizzes');

const router = express.Router();

function validateOptions(type, options) {
  if (!Array.isArray(options) || options.length < 2) {
    return 'Нужно минимум 2 варианта ответа';
  }
  const correctCount = options.filter((o) => o.is_correct).length;
  if (correctCount === 0) {
    return 'Нужен хотя бы один правильный вариант';
  }
  if (type === 'single' && correctCount > 1) {
    return 'Для типа single должен быть только один правильный вариант';
  }
  return null;
}

async function getOwnedQuestion(questionId, userId) {
  const result = await pool.query(
    `SELECT q.*, qz.author_id FROM questions q
     JOIN quizzes qz ON qz.id = q.quiz_id
     WHERE q.id = $1`,
    [questionId]
  );
  const question = result.rows[0];
  if (!question) return { question: null, owned: false };
  return { question, owned: question.author_id === userId };
}

// Добавить вопрос с вариантами ответов в квиз
router.post('/quizzes/:quizId/questions', requireAuth, requireRole('organizer'), async (req, res) => {
  const { question_text, image_url, type, time_limit, options } = req.body;

  if (!question_text || !type) {
    return res.status(400).json({ error: 'Текст вопроса и тип обязательны' });
  }
  if (!['single', 'multiple'].includes(type)) {
    return res.status(400).json({ error: 'Недопустимый тип вопроса' });
  }
  const optionsError = validateOptions(type, options);
  if (optionsError) {
    return res.status(400).json({ error: optionsError });
  }

  const client = await pool.connect();
  try {
    const { quiz, owned } = await getOwnedQuiz(req.params.quizId, req.user.id);
    if (!quiz) return res.status(404).json({ error: 'Квиз не найден' });
    if (!owned) return res.status(403).json({ error: 'Недостаточно прав' });

    await client.query('BEGIN');

    const orderResult = await client.query(
      'SELECT COALESCE(MAX(order_index), -1) + 1 AS next_index FROM questions WHERE quiz_id = $1',
      [quiz.id]
    );
    const orderIndex = orderResult.rows[0].next_index;

    const questionResult = await client.query(
      `INSERT INTO questions (quiz_id, order_index, question_text, image_url, type, time_limit)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [quiz.id, orderIndex, question_text, image_url || null, type, time_limit || quiz.time_per_question]
    );
    const question = questionResult.rows[0];

    const optResult = await client.query(
      `INSERT INTO answer_options (question_id, text, is_correct)
       SELECT $1, t, c FROM unnest($2::text[], $3::boolean[]) AS x(t, c)
       RETURNING *`,
      [question.id, options.map((o) => o.text), options.map((o) => !!o.is_correct)]
    );

    await client.query('COMMIT');
    res.status(201).json({ ...question, options: optResult.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка создания вопроса:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally {
    client.release();
  }
});

// Обновить вопрос (текст/тип/изображение/время и полностью заменить варианты ответов)
router.put('/questions/:id', requireAuth, requireRole('organizer'), async (req, res) => {
  const { question_text, image_url, type, time_limit, options } = req.body;

  const client = await pool.connect();
  try {
    const { question, owned } = await getOwnedQuestion(req.params.id, req.user.id);
    if (!question) return res.status(404).json({ error: 'Вопрос не найден' });
    if (!owned) return res.status(403).json({ error: 'Недостаточно прав' });

    const finalType = type ?? question.type;
    if (!['single', 'multiple'].includes(finalType)) {
      return res.status(400).json({ error: 'Недопустимый тип вопроса' });
    }
    if (options) {
      const optionsError = validateOptions(finalType, options);
      if (optionsError) return res.status(400).json({ error: optionsError });
    }

    await client.query('BEGIN');

    const updated = await client.query(
      `UPDATE questions SET question_text = $1, image_url = $2, type = $3, time_limit = $4
       WHERE id = $5 RETURNING *`,
      [
        question_text ?? question.question_text,
        image_url !== undefined ? (image_url || null) : question.image_url,
        finalType,
        time_limit ?? question.time_limit,
        question.id,
      ]
    );

    let resultOptions;
    if (options) {
      await client.query('DELETE FROM answer_options WHERE question_id = $1', [question.id]);
      const optResult = await client.query(
        `INSERT INTO answer_options (question_id, text, is_correct)
         SELECT $1, t, c FROM unnest($2::text[], $3::boolean[]) AS x(t, c)
         RETURNING *`,
        [question.id, options.map((o) => o.text), options.map((o) => !!o.is_correct)]
      );
      resultOptions = optResult.rows;
    } else {
      const existing = await client.query('SELECT * FROM answer_options WHERE question_id = $1', [question.id]);
      resultOptions = existing.rows;
    }

    await client.query('COMMIT');
    res.json({ ...updated.rows[0], options: resultOptions });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка обновления вопроса:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally {
    client.release();
  }
});

// Удалить вопрос
router.delete('/questions/:id', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const { question, owned } = await getOwnedQuestion(req.params.id, req.user.id);
    if (!question) return res.status(404).json({ error: 'Вопрос не найден' });
    if (!owned) return res.status(403).json({ error: 'Недостаточно прав' });

    await pool.query('DELETE FROM questions WHERE id = $1', [question.id]);
    res.status(204).end();
  } catch (err) {
    console.error('Ошибка удаления вопроса:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
