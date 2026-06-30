import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Sidebar() {
  const { user, selectRole } = useAuth();
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const navigate = useNavigate();

  async function handleRoleChange(newRole) {
    await selectRole(newRole);
    setShowRoleMenu(false);
    // Редирект на нужную страницу
    navigate(newRole === 'organizer' ? '/dashboard' : '/join');
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-badge">Q</span>
        Квиzzzы
      </div>

      <nav className="sidebar-nav">
        {user?.active_role === 'organizer' && (
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            Мои квизы
          </NavLink>
        )}
        {user?.active_role === 'participant' && (
          <NavLink
            to="/join"
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            Войти в квиз
          </NavLink>
        )}
        <NavLink
          to="/history"
          className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
        >
          История
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
        >
          Настройки
        </NavLink>
      </nav>

      {user && (
        <div className="sidebar-profile">
          <span className="sidebar-avatar">{initials(user.name)}</span>
          <div>
            <div className="sidebar-profile-name">{user.name}</div>
            {user.roles && user.roles.length > 1 ? (
              <div className="sidebar-role-switcher">
                <button
                  className="sidebar-role-btn"
                  onClick={() => setShowRoleMenu(!showRoleMenu)}
                >
                  {user.active_role === 'organizer' ? 'Организатор' : 'Участник'} ▼
                </button>
                {showRoleMenu && (
                  <div className="sidebar-role-menu">
                    {user.roles.map((role) => (
                      <button
                        key={role}
                        className={`sidebar-role-menu-item${user.active_role === role ? ' active' : ''}`}
                        onClick={() => handleRoleChange(role)}
                      >
                        {role === 'organizer' ? 'Организатор' : 'Участник'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="sidebar-profile-role">
                {user.active_role === 'organizer' ? 'Организатор' : 'Участник'}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
