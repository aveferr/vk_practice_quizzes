import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {Sidebar} from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import './OrganizerDashboard.css';


export function OrganizerDashboard() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getQuizzes(token)
      .then(setQuizzes)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleCreate() {
    const title = window.prompt('Название квиза:');
    if (!title) return;
    try {
      const quiz = await api.createQuiz(token, { title });
      navigate(`/quizzes/${quiz.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleStart(quizId) {
    try {
      const session = await api.createSession(token, quizId);
      navigate(`/rooms/${session.id}`);
    } catch (err) {
      window.alert(err.message);
    }
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="dashboard">
        <div className="dashboard-header">
          <div>
            <h1>Мои квизы</h1>
            <p className="dashboard-subtitle">{quizzes.length} квизов · управляйте и запускайте</p>
          </div>
          <button className="btn-primary" onClick={handleCreate}>
            + Создать квиз
          </button>
        </div>

        {loading && <p>Загрузка…</p>}
        {error && <p className="auth-error">{error}</p>}

        {!loading && quizzes.length === 0 && (
          <p className="dashboard-empty">У вас пока нет квизов — создайте первый.</p>
        )}

        <div className="quiz-grid">
          {quizzes.map((quiz) => (
            <div className="quiz-card" key={quiz.id}>
              <div className="quiz-card-actions">
                <button className="btn-secondary" onClick={() => navigate(`/quizzes/${quiz.id}`)}>
                  Редактировать
                </button>
                <button className="btn-primary" onClick={() => handleStart(quiz.id)}>
                  Запустить
                </button>
              </div>
              <h3>{quiz.title}</h3>
              <div className="quiz-card-meta">
                {quiz.category && <span className="badge">{quiz.category}</span>}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

