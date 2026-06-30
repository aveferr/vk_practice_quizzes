const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const pool = require('./db');
const authRoutes = require('./routes/auth');
const meRoutes = require('./routes/me');
const { router: quizzesRoutes } = require('./routes/quizzes');
const questionsRoutes = require('./routes/questions');
const sessionsRoutes = require('./routes/sessions');
const attachQuizSocket = require('./sockets/quiz');

const ALLOWED_ORIGIN = process.env.FRONTEND_URL ?? '*';

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.log('Ошибка подключения к БД:', err.message);
  } else {
    console.log('БД подключена:', res.rows[0].now);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/quizzes', quizzesRoutes);
app.use('/api', questionsRoutes);
app.use('/api', sessionsRoutes);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ALLOWED_ORIGIN } });
attachQuizSocket(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
