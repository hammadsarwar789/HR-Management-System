/// <reference types="vite/client" />
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace('/api/v1', '')
  : 'http://localhost:5000';


let socketInstance: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socketInstance;
};

export const connectSocket = (userInfo?: {
  id?: string | number;
  role?: string;
  department_id?: string | number;
}): Socket => {
  const socket = getSocket();
  
  if (!socket.connected) {
    socket.connect();
  }

  if (userInfo) {
    socket.emit('join', {
      user_id: userInfo.id,
      role: userInfo.role,
      department_id: userInfo.department_id,
    });
  }

  return socket;
};

export const disconnectSocket = () => {
  if (socketInstance && socketInstance.connected) {
    socketInstance.disconnect();
  }
};
