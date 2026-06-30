import { io } from 'socket.io-client';

let socket = null;
let socketToken = null;

export function getSocket(token) {
  // Если токен сменился — закрываем старый сокет и создаём новый
  if (socket && socketToken !== token) {
    socket.close();
    socket = null;
    socketToken = null;
  }

  if (socket) return socket;

  socket = io(import.meta.env.VITE_API_URL ?? '', { auth: { token } });
  socketToken = token;
  return socket;
}

export function closeSocket() {
  if (socket) {
    socket.close();
    socket = null;
    socketToken = null;
  }
}
