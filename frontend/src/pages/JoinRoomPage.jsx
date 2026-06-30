import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {Sidebar} from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../api/socket';
import './JoinRoomPage.css';

export function JoinRoomPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Сокет НЕ закрываем при размонтировании — он переходит в RoomPage
  // который переиспользует тот же сокет через getSocket(token)

  function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const socket = getSocket(token);
    socket.emit('join_room', { room_code: code.trim() }, (ack) => {
      setLoading(false);
      if (ack?.error) {
        setError(ack.error);
        return;
      }
      const sessionId = ack?.session?.id;
      if (!sessionId) {
        setError('Не удалось получить данные комнаты');
        return;
      }
      navigate(`/rooms/${sessionId}`);
    });
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="join-page">
        <div className="join-card">
          <h1>Квиzzzы</h1>
          <p className="room-lobby-subtitle">Введите код комнаты, чтобы присоединиться к квизу</p>

          <form onSubmit={handleSubmit}>
            <input
              className="modal-input join-input"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              autoFocus
            />
            {error && <p className="auth-error">{error}</p>}
            <button className="btn-primary join-submit" disabled={loading || code.length !== 6}>
              {loading ? 'Подключение…' : 'Войти в комнату'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
