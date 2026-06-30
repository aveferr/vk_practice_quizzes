const BASE_URL = (import.meta.env.VITE_API_URL ?? '') + '/api';

async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = res.status === 204 ? null : await res.json();

  if (!res.ok) {
    throw new Error(data?.error || 'Ошибка запроса');
  }

  return data;
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  selectRole: (token, payload) => request('/auth/select-role', { method: 'POST', body: payload, token }),
  me: (token) => request('/me', { token }),

  getQuizzes: (token) => request('/quizzes', { token }),
  getQuiz: (token, id) => request(`/quizzes/${id}`, { token }),
  createQuiz: (token, payload) => request('/quizzes', { method: 'POST', body: payload, token }),
  updateQuiz: (token, id, payload) => request(`/quizzes/${id}`, { method: 'PUT', body: payload, token }),
  deleteQuiz: (token, id) => request(`/quizzes/${id}`, { method: 'DELETE', token }),

  addQuestion: (token, quizId, payload) =>
    request(`/quizzes/${quizId}/questions`, { method: 'POST', body: payload, token }),
  updateQuestion: (token, id, payload) =>
    request(`/questions/${id}`, { method: 'PUT', body: payload, token }),
  deleteQuestion: (token, id) => request(`/questions/${id}`, { method: 'DELETE', token }),

  createSession: (token, quizId) =>
    request(`/quizzes/${quizId}/sessions`, { method: 'POST', body: {}, token }),
  getSession: (token, id) => request(`/sessions/${id}`, { token }),

  getHistory: (token) => request('/me/history', { token }),
  getHostedSessions: (token) => request('/me/hosted-sessions', { token }),
};
