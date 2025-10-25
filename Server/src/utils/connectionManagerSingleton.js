import ConnectionManager from '../connections/ConnectionManager.js';
import { Server as socketIo } from 'socket.io';

let connectionManagerInstance = null;
let ioInstance = null;

function getConnectionManager(io) {
  if (io) {
    ioInstance = io;
  }

  if (!connectionManagerInstance) {
    if (!ioInstance) {
      throw new Error('Socket.IO instance is required');
    }
    connectionManagerInstance = new ConnectionManager(ioInstance);
  }

  return connectionManagerInstance;
}

export {
  getConnectionManager
}; 