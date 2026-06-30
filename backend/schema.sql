DROP TABLE IF EXISTS session_question_results CASCADE;
DROP TABLE IF EXISTS session_answers CASCADE;
DROP TABLE IF EXISTS quiz_session_participants CASCADE;
DROP TABLE IF EXISTS quiz_sessions CASCADE;
DROP TABLE IF EXISTS answer_options CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS quizzes CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name VARCHAR(255) NOT NULL,
  roles TEXT[] NOT NULL DEFAULT '{participant}',
  active_role VARCHAR(20) NOT NULL DEFAULT 'participant',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  time_per_question INT DEFAULT 30,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  order_index INT NOT NULL,
  question_text TEXT NOT NULL,
  image_url TEXT,
  type VARCHAR(20) CHECK (type IN ('single', 'multiple')) NOT NULL,
  time_limit INT DEFAULT 30
);

CREATE TABLE answer_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE quiz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  host_id UUID REFERENCES users(id),
  room_code VARCHAR(10) UNIQUE NOT NULL,
  status VARCHAR(20) CHECK (status IN ('waiting', 'active', 'finished')) DEFAULT 'waiting',
  current_question_index INT DEFAULT 0,
  started_at TIMESTAMP,
  finished_at TIMESTAMP
);

-- Участники сессии: кто подключился к комнате и сколько у него очков
CREATE TABLE quiz_session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  total_score INT DEFAULT 0,
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (session_id, user_id)
);

-- Лог выбранных вариантов ответа (несколько строк на вопрос при type = 'multiple')
CREATE TABLE session_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  answer_option_id UUID REFERENCES answer_options(id) ON DELETE CASCADE,
  answered_at_ms INT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (session_id, user_id, question_id, answer_option_id)
);

-- Итог по вопросу: одна строка на (сессия, пользователь, вопрос) — правильность считается
-- по совпадению всего набора выбранных опций с набором is_correct=true опций вопроса
CREATE TABLE session_question_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  is_correct BOOLEAN NOT NULL,
  score_earned INT DEFAULT 0,
  answered_at_ms INT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (session_id, user_id, question_id)
);

-- Индексы по внешним ключам (Postgres их не создаёт автоматически)
CREATE INDEX idx_quizzes_author ON quizzes(author_id);
CREATE INDEX idx_questions_quiz ON questions(quiz_id);
CREATE INDEX idx_answer_options_question ON answer_options(question_id);
CREATE INDEX idx_quiz_sessions_quiz ON quiz_sessions(quiz_id);
CREATE INDEX idx_quiz_sessions_room_code ON quiz_sessions(room_code);
CREATE INDEX idx_session_participants_session ON quiz_session_participants(session_id);
CREATE INDEX idx_session_answers_session ON session_answers(session_id);
CREATE INDEX idx_session_answers_question ON session_answers(question_id);
CREATE INDEX idx_session_question_results_session ON session_question_results(session_id);
