const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// История участника: его результаты в завершённых квизах
router.get('/history', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         qs.id AS session_id,
         q.title,
         qs.finished_at,
         p.total_score,
         (SELECT COUNT(*) + 1 FROM quiz_session_participants p2
            WHERE p2.session_id = qs.id AND p2.total_score > p.total_score) AS rank,
         (SELECT COUNT(*) FROM quiz_session_participants p3 WHERE p3.session_id = qs.id) AS total_participants
       FROM quiz_session_participants p
       JOIN quiz_sessions qs ON qs.id = p.session_id
       JOIN quizzes q ON q.id = qs.quiz_id
       WHERE p.user_id = $1 AND qs.status = 'finished'
       ORDER BY qs.finished_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка получения истории:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// История организатора: завершённые сессии его квизов
router.get('/hosted-sessions', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         qs.id AS session_id,
         q.title,
         qs.finished_at,
         qs.room_code,
         (SELECT COUNT(*) FROM quiz_session_participants p WHERE p.session_id = qs.id) AS participants_count
       FROM quiz_sessions qs
       JOIN quizzes q ON q.id = qs.quiz_id
       WHERE qs.host_id = $1 AND qs.status = 'finished'
       ORDER BY qs.finished_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка получения истории сессий:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
