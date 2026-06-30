import {Sidebar} from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import './SettingsPage.css';

export function SettingsPage() {
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    // После logout() токен очищается, ProtectedRoute автоматически
    // перенаправит на /auth — дополнительный navigate не нужен
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="settings-main">
        <h1>Настройки</h1>

        <div className="settings-card">
          <strong>{user.name}</strong>
          <p className="room-lobby-subtitle">{user.email}</p>
          <p className="room-lobby-subtitle">
            Роли: {user.roles?.join(', ') || 'нет'}
          </p>
          <p className="room-lobby-subtitle">
            Текущая роль: {user.active_role === 'organizer' ? 'Организатор' : 'Участник'}
          </p>
        </div>

        <div className="settings-logout">
          <button className="btn-secondary" onClick={handleLogout}>
            Выйти из аккаунта
          </button>
        </div>
      </main>
    </div>
  );
}
