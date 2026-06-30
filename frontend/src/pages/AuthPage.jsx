import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AuthPage.css';

export function AuthPage() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('participant');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { token, user, login, register, selectRole } = useAuth();
  const navigate = useNavigate();

  // Если уже авторизован — редиректим на нужную страницу
  if (token && user) {
    return <Navigate to={user.active_role === 'organizer' ? '/dashboard' : '/join'} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') {
        // При регистрации сразу авторизуем и отправляем на /join
        await register(email, password, name);
        navigate('/join');
        return;
      }

      // Вход: переключаем роль если нужно, затем редиректим
      const data = await login(email, password);
      if (data.user.active_role !== role) {
        const updated = await selectRole(role);
        navigate(updated.user.active_role === 'organizer' ? '/dashboard' : '/join');
        return;
      }
      navigate(data.user.active_role === 'organizer' ? '/dashboard' : '/join');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="auth-hero-title">Квиzzzы</div>
        <p className="auth-hero-tagline">Интерактивные квизы в реальном времени</p>
      </div>

      <div className="auth-form-panel">
        <h1 className="auth-heading">Добро пожаловать</h1>
        <p className="auth-subheading">Войдите или создайте аккаунт</p>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab${mode === 'login' ? ' active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Вход
          </button>
          <button
            type="button"
            className={`auth-tab${mode === 'register' ? ' active' : ''}`}
            onClick={() => { setMode('register'); setError(''); }}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <label className="auth-label">Имя</label>
              <input
                className="auth-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ваше имя"
                required
              />
            </>
          )}

          <label className="auth-label">Электронная почта</label>
          <input
            className="auth-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />

          <label className="auth-label">Пароль</label>
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={6}
            required
          />

          {mode === 'login' && (
            <>
              <div className="auth-label">Войти как</div>
              <div className="auth-role-pick">
                <button
                  type="button"
                  className={`auth-role-card${role === 'participant' ? ' selected' : ''}`}
                  onClick={() => setRole('participant')}
                >
                  <strong>Участник</strong>
                  <span>Присоединяться и играть</span>
                </button>
                <button
                  type="button"
                  className={`auth-role-card${role === 'organizer' ? ' selected' : ''}`}
                  onClick={() => setRole('organizer')}
                >
                  <strong>Организатор</strong>
                  <span>Создавать и проводить</span>
                </button>
              </div>
            </>
          )}

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </form>
      </div>
    </div>
  );
}
