import { useEffect, useState } from 'react';
import './QuestionModal.css';

let _keyCounter = 0;

function emptyOption() {
  return { _key: ++_keyCounter, text: '', is_correct: false };
}

function buildInitialState(initialData, defaultTimeLimit) {
  if (initialData) {
    return {
      question_text: initialData.question_text,
      image_url: initialData.image_url || '',
      type: initialData.type,
      time_limit: initialData.time_limit ?? defaultTimeLimit ?? 30,
      options: initialData.options.map((o) => ({ _key: o.id, id: o.id, text: o.text, is_correct: o.is_correct })),
    };
  }
  return {
    question_text: '',
    image_url: '',
    type: 'single',
    time_limit: defaultTimeLimit ?? 30,
    options: [emptyOption(), emptyOption()],
  };
}

export function QuestionModal({ open, initialData, defaultTimeLimit, onClose, onSave }) {
  const [form, setForm] = useState(() => buildInitialState(initialData, defaultTimeLimit));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(buildInitialState(initialData, defaultTimeLimit));
      setError('');
    }
  }, [open, initialData, defaultTimeLimit]);

  if (!open) return null;

  function setOptionText(index, text) {
    setForm((f) => ({
      ...f,
      options: f.options.map((o, i) => (i === index ? { ...o, text } : o)),
    }));
  }

  function toggleCorrect(index) {
    setForm((f) => ({
      ...f,
      options: f.options.map((o, i) =>
        f.type === 'single'
          ? { ...o, is_correct: i === index }
          : i === index
            ? { ...o, is_correct: !o.is_correct }
            : o
      ),
    }));
  }

  function setType(type) {
    setForm((f) => {
      if (type === 'single') {
        const firstCorrectIndex = f.options.findIndex((o) => o.is_correct);
        const targetIndex = firstCorrectIndex >= 0 ? firstCorrectIndex : 0;
        return {
          ...f,
          type,
          options: f.options.map((o, i) => ({ ...o, is_correct: i === targetIndex })),
        };
      }
      return { ...f, type };
    });
  }

  function addOption() {
    setForm((f) => ({ ...f, options: [...f.options, emptyOption()] }));
  }

  function removeOption(index) {
    setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    if (!form.question_text.trim()) return setError('Введите текст вопроса');
    if (form.options.length < 2) return setError('Нужно минимум 2 варианта ответа');
    if (form.options.some((o) => !o.text.trim())) return setError('Заполните текст всех вариантов');
    const correctCount = form.options.filter((o) => o.is_correct).length;
    if (correctCount === 0) return setError('Отметьте хотя бы один правильный вариант');
    if (form.type === 'single' && correctCount > 1) return setError('Для типа "один ответ" может быть только один правильный вариант');

    setError('');
    setSaving(true);
    try {
      await onSave({
        question_text: form.question_text.trim(),
        image_url: form.image_url.trim() || null,
        type: form.type,
        time_limit: Number(form.time_limit) || 30,
        options: form.options.map((o) => ({ text: o.text.trim(), is_correct: o.is_correct })),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{initialData ? 'Изменить вопрос' : 'Добавить вопрос'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-col">
            <label className="modal-label">Текст вопроса</label>
            <textarea
              className="modal-textarea"
              value={form.question_text}
              onChange={(e) => setForm((f) => ({ ...f, question_text: e.target.value }))}
              placeholder="Введите текст вопроса…"
              rows={4}
            />

            <label className="modal-label">Ссылка на изображение (опционально)</label>
            <input
              className="modal-input"
              value={form.image_url}
              onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
              placeholder="https://…"
            />

            <label className="modal-label">Время на вопрос (сек)</label>
            <input
              className="modal-input"
              type="number"
              min={5}
              max={300}
              value={form.time_limit}
              onChange={(e) => setForm((f) => ({ ...f, time_limit: e.target.value }))}
            />

            <div className="modal-toggle-row">
              <div>
                <strong>Один правильный ответ</strong>
                <p className="modal-hint">Переключите для нескольких ответов</p>
              </div>
              <button
                type="button"
                className={`toggle-switch${form.type === 'single' ? ' on' : ''}`}
                onClick={() => setType(form.type === 'single' ? 'multiple' : 'single')}
                aria-pressed={form.type === 'single'}
              >
                <span className="toggle-knob" />
              </button>
            </div>
          </div>

          <div className="modal-col">
            <label className="modal-label">Варианты ответов</label>
            {form.options.map((option, index) => (
              <div className="modal-option-row" key={option._key}>
                <button
                  type="button"
                  className={`option-marker${option.is_correct ? ' correct' : ''}${form.type === 'single' ? ' round' : ''}`}
                  onClick={() => toggleCorrect(index)}
                  aria-label="Отметить как правильный"
                >
                  {option.is_correct && '✓'}
                </button>
                <input
                  className="modal-input"
                  value={option.text}
                  onChange={(e) => setOptionText(index, e.target.value)}
                  placeholder={`Вариант ${index + 1}`}
                />
                {form.options.length > 2 && (
                  <button type="button" className="option-remove" onClick={() => removeOption(index)} aria-label="Удалить вариант">
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="modal-add-option" onClick={addOption}>
              + Добавить вариант
            </button>
          </div>
        </div>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить вопрос'}
          </button>
        </div>
      </div>
    </div>
  );
}
