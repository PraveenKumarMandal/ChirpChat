import { io } from 'socket.io-client';
import { SOCKET_URL } from './config';

const logSocketEvent = (...args) => {
  if (__DEV__) {
    console.log(...args);
  }
};

const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 10000,
});

socket.on('connect', () => {
  logSocketEvent('Socket connected:', socket.id);
});

socket.on('disconnect', () => {
  logSocketEvent('Socket disconnected');
});

socket.on('connect_error', (error) => {
  logSocketEvent('Socket connection error:', error.message);
});

export default socket;
