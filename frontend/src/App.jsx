import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import {ProtectedRoute} from './components/ProtectedRoute';
import { AuthPage} from './pages/AuthPage';
import { OrganizerDashboard } from './pages/OrganizerDashboard';  
import {QuizEditorPage} from './pages/QuizEditorPage';
import {RoomPage} from './pages/RoomPage';
import {JoinRoomPage} from './pages/JoinRoomPage';
import {HistoryPage} from './pages/HistoryPage';
import {SettingsPage} from './pages/SettingsPage';

function HomeRedirect() {
  const { token, user } = useAuth();
  if (!token || !user) return <Navigate to="/auth" replace />;
  return <Navigate to={user.active_role === 'organizer' ? '/dashboard' : '/join'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/auth" element={<AuthPage />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <OrganizerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/quizzes/:id"
            element={
              <ProtectedRoute>
                <QuizEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rooms/:id"
            element={
              <ProtectedRoute>
                <RoomPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/join"
            element={
              <ProtectedRoute>
                <JoinRoomPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <HistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
