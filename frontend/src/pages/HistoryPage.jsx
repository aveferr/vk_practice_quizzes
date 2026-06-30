import { useEffect, useState } from 'react';
import {Sidebar} from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import './HistoryPage.css';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function HistoryPage() {
  const { token, user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isOrganizer = user.active_role === 'organizer';

  useEffect(() => {
    const request = isOrganizer ? api.getHostedSessions(token) : api.getHistory(token);
    request
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, isOrganizer]);

  const totalScore = !isOrganizer ? items.reduce((sum, i) => sum + i.total_score, 0) : null;

  return (
    <div className="layout">
      <Sidebar />
      <main className="history-main">
        <h1>{isOrganizer ? 'История проведённых квизов' : 'Моя история'}</h1>
        <p className="room-lobby-subtitle">
          {items.length} {isOrganizer ? 'сессий' : 'квизов'}
          {!isOrganizer && ` · ${totalScore} очков всего`}
        </p>

        {loading && <p>Загрузка…</p>}
        {error && <p className="auth-error">{error}</p>}
        {!loading && items.length === 0 && (
          <p className="dashboard-empty">
            {isOrganizer ? 'Вы пока не провели ни одного квиза.' : 'Вы пока не участвовали ни в одном квизе.'}
          </p>
        )}

        <div className="history-list">
          {isOrganizer
            ? items.map((item) => (
                <div className="history-card" key={item.session_id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p className="room-lobby-subtitle">
                      {formatDate(item.finished_at)} · код {item.room_code}
                    </p>
                  </div>
                  <span className="badge">{item.participants_count} участников</span>
                </div>
              ))
            : items.map((item) => (
                <div className="history-card" key={item.session_id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p className="room-lobby-subtitle">
                      {formatDate(item.finished_at)} ·{' '}
                      <span className={`badge${Number(item.rank) === 1 ? ' badge-success' : ''}`}>
                        #{item.rank} из {item.total_participants}
                      </span>
                    </p>
                  </div>
                  <div className="history-score">
                    <strong>{item.total_score}</strong>
                    <span>очков</span>
                  </div>
                </div>
              ))}
        </div>
      </main>
    </div>
  );
}
