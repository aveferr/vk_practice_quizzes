import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sidebar} from '../components/Sidebar';
import {QuestionModal} from '../components/QuestionModal';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import './QuizEditorPage.css';

function pluralOptions(n) {
  if (n === 1) return '1 вариант';
  if (n >= 2 && n <= 4) return `${n} варианта`;
  return `${n} вариантов`;
}

export function QuizEditorPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState(null);

  useEffect(() => {
    setQuiz(null);
    setError('');
    setLoading(true);
    api
      .getQuiz(token, id)
      .then(setQuiz)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, id]);

  async function handleSettingsBlur(field, value) {
    if (!quiz || quiz[field] === value) return;
    setSavingSettings(true);
    try {
      const updated = await api.updateQuiz(token, id, { [field]: value });
      setQuiz((q) => ({ ...q, ...updated }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSaveQuestion(payload) {
    if (editingQuestion) {
      const updated = await api.updateQuestion(token, editingQuestion.id, payload);
      setQuiz((q) => ({
        ...q,
        questions: q.questions.map((qq) => (qq.id === updated.id ? updated : qq)),
      }));
    } else {
      const created = await api.addQuestion(token, id, payload);
      setQuiz((q) => ({ ...q, questions: [...q.questions, created] }));
    }
    setModalOpen(false);
    setEditingQuestion(null);
  }

  async function handleDeleteQuestion(questionId) {
    if (!window.confirm('Удалить этот вопрос?')) return;
    try {
      await api.deleteQuestion(token, questionId);
      setQuiz((q) => ({ ...q, questions: q.questions.filter((qq) => qq.id !== questionId) }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateRoom() {
    try {
      const session = await api.createSession(token, id);
      navigate(`/rooms/${session.id}`);
    } catch (err) {
      window.alert(err.message);
    }
  }

  if (loading) {
    return (
      <div className="layout">
        <Sidebar />
        <main className="editor-main">Загрузка…</main>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="layout">
        <Sidebar />
        <main className="editor-main">
          <p className="auth-error">{error || 'Квиз не найден'}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="editor-main">
        <div className="editor-header">
          <button className="btn-secondary" onClick={() => navigate('/dashboard')}>
            ← Назад
          </button>
          <h1>Редактор квиза</h1>
          <div className="editor-header-actions">
            <button
              className="btn-secondary"
              disabled={quiz.questions.length === 0}
              onClick={() => setPreviewQuestion(quiz.questions[0])}
            >
              Предпросмотр
            </button>
            <button className="btn-primary" onClick={handleCreateRoom}>
              Сохранить и создать комнату
            </button>
          </div>
        </div>

        <div className="editor-body">
          <div className="editor-settings">
            <h3>Настройки квиза</h3>

            <label className="modal-label">Название квиза</label>
            <input
              className="modal-input"
              defaultValue={quiz.title}
              onBlur={(e) => handleSettingsBlur('title', e.target.value)}
            />

            <label className="modal-label">Категория</label>
            <input
              className="modal-input"
              defaultValue={quiz.category || ''}
              onBlur={(e) => handleSettingsBlur('category', e.target.value)}
            />

            <label className="modal-label">Время на вопрос (сек)</label>
            <input
              className="modal-input"
              type="number"
              min={5}
              defaultValue={quiz.time_per_question}
              onBlur={(e) => handleSettingsBlur('time_per_question', Number(e.target.value))}
            />
            {savingSettings && <p className="modal-hint">Сохранение…</p>}
          </div>

          <div className="editor-questions">
            <div className="editor-questions-header">
              <h3>Вопросы ({quiz.questions.length})</h3>
              <button
                className="btn-primary"
                onClick={() => {
                  setEditingQuestion(null);
                  setModalOpen(true);
                }}
              >
                + Добавить вопрос
              </button>
            </div>

            {quiz.questions.map((q, index) => (
              <div className="question-row" key={q.id}>
                <span className="question-index">{index + 1}</span>
                <div className="question-row-body">
                  <strong>{q.question_text}</strong>
                  <div className="question-row-meta">
                    <span className="badge">{q.type === 'single' ? 'Один ответ' : 'Несколько ответов'}</span>
                    <span className="question-row-count">{pluralOptions(q.options.length)}</span>
                  </div>
                </div>
                <div className="question-row-actions">
                  <button
                    className="btn-icon"
                    title="Редактировать"
                    onClick={() => {
                      setEditingQuestion(q);
                      setModalOpen(true);
                    }}
                  >
                    ✎
                  </button>
                  <button className="btn-icon btn-icon-danger" title="Удалить" onClick={() => handleDeleteQuestion(q.id)}>
                    🗑
                  </button>
                </div>
              </div>
            ))}

            <button
              className="question-add-placeholder"
              onClick={() => {
                setEditingQuestion(null);
                setModalOpen(true);
              }}
            >
              + Добавить вопрос
            </button>
          </div>
        </div>
      </main>

      <QuestionModal
        open={modalOpen}
        initialData={editingQuestion}
        defaultTimeLimit={quiz.time_per_question}
        onClose={() => {
          setModalOpen(false);
          setEditingQuestion(null);
        }}
        onSave={handleSaveQuestion}
      />

      {previewQuestion && (
        <div className="modal-overlay" onClick={() => setPreviewQuestion(null)}>
          <div className="preview-card" onClick={(e) => e.stopPropagation()}>
            <div className="preview-header">
              <span className="preview-badge">Предпросмотр</span>
              <button className="modal-close" onClick={() => setPreviewQuestion(null)}>✕</button>
            </div>
            <div className="preview-nav">
              {quiz.questions.map((q, i) => (
                <button
                  key={q.id}
                  className={`preview-nav-dot${previewQuestion.id === q.id ? ' active' : ''}`}
                  onClick={() => setPreviewQuestion(q)}
                  title={`Вопрос ${i + 1}`}
                />
              ))}
            </div>
            <p className="preview-meta">
              Вопрос {quiz.questions.findIndex((q) => q.id === previewQuestion.id) + 1} из {quiz.questions.length} · {previewQuestion.time_limit} сек · {previewQuestion.type === 'single' ? 'Один ответ' : 'Несколько ответов'}
            </p>
            <h2 className="preview-question-text">{previewQuestion.question_text}</h2>
            {previewQuestion.image_url && (
              <img src={previewQuestion.image_url} alt="" className="preview-image" />
            )}
            <div className="preview-options">
              {previewQuestion.options.map((opt, i) => (
                <div key={opt.id ?? i} className={`preview-option tile-${['red','blue','amber','green'][i % 4]}`}>
                  {opt.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
