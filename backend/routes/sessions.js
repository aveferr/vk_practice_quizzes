const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getOwnedQuiz } = require('./quizzes');

const router = express.Router();

function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Создать сессию (комнату) для квиза
// Проверка уникальности кода и INSERT выполняются в одной транзакции,
// чтобы исключить гонку состояний между двумя одновременными запросами.
router.post('/quizzes/:quizId/sessions', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const { quiz, owned } = await getOwnedQuiz(req.params.quizId, req.user.id);
    if (!quiz) return res.status(404).json({ error: 'Квиз не найден' });
    if (!owned) return res.status(403).json({ error: 'Недостаточно прав' });

    const client = await pool.connect();
    try {
      const questionsCount = await client.query('SELECT COUNT(*) FROM questions WHERE quiz_id = $1', [quiz.id]);
      if (Number(questionsCount.rows[0].count) === 0) {
        return res.status(400).json({ error: 'В квизе нет вопросов' });
      }

      await client.query('BEGIN');

      let result;
      for (let attempt = 0; attempt < 10; attempt++) {
        const code = generateRoomCode();
        try {
          result = await client.query(
            `INSERT INTO quiz_sessions (quiz_id, host_id, room_code)
             VALUES ($1, $2, $3) RETURNING *`,
            [quiz.id, req.user.id, code]
          );
          break; // INSERT прошёл без конфликта — выходим из цикла
        } catch (insertErr) {
          // Код комнаты уже занят (нарушение UNIQUE) — пробуем следующий
          if (insertErr.code === '23505') continue;
          throw insertErr;
        }
      }

      if (!result) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: 'Не удалось сгенерировать уникальный код комнаты' });
      }

      await client.query('COMMIT');
      res.status(201).json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Ошибка создания сессии:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить сессию по id (хост или участник) вместе с базовой информацией о квизе
router.get('/sessions/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT qs.*, q.title, q.category,
         (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS question_count
       FROM quiz_sessions qs
       JOIN quizzes q ON q.id = qs.quiz_id
       WHERE qs.id = $1`,
      [req.params.id]
    );
    const session = result.rows[0];
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
    res.json(session);
  } catch (err) {
    console.error('Ошибка получения сессии:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
