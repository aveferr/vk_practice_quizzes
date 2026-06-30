const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, roles: user.roles, active_role: user.active_role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
  }

  try {
    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (existing.rows.length > 0) {
      // Email уже занят — проверяем пароль прежде чем что-либо делать
      return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
    }

    // Новый пользователь сразу получает обе роли
    const roles = ['participant', 'organizer'];
    const result = await pool.query(
      `INSERT INTO users (email, password, name, roles, active_role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, roles, active_role, created_at`,
      [email, password, name, roles, 'participant']
    );

    const user = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Ошибка регистрации:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    if (password !== user.password) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, roles: user.roles, active_role: user.active_role, created_at: user.created_at },
    });
  } catch (err) {
    console.error('Ошибка входа:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.post('/select-role', requireAuth, async (req, res) => {
  const { role } = req.body;

  if (!role) {
    return res.status(400).json({ error: 'Укажите роль' });
  }
  if (!['organizer', 'participant'].includes(role)) {
    return res.status(400).json({ error: 'Недопустимая роль' });
  }

  try {
    // Сначала получаем актуальные данные пользователя из БД
    const existing = await pool.query(
      'SELECT id, email, name, roles, active_role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    const current = existing.rows[0];

    // Проверяем наличие роли ДО любых изменений в БД
    if (!current.roles.includes(role)) {
      return res.status(403).json({ error: 'У вас нет этой роли' });
    }

    const result = await pool.query(
      'UPDATE users SET active_role = $1 WHERE id = $2 RETURNING id, email, name, roles, active_role, created_at',
      [role, req.user.id]
    );

    const user = result.rows[0];
    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, roles: user.roles, active_role: user.active_role, created_at: user.created_at },
    });
  } catch (err) {
    console.error('Ошибка выбора роли:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
