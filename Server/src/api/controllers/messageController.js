import * as messageService from '../services/messageService.js';

export const sendMessage = async (req, res) => {
  await messageService.sendMessage(req, res);
};

export const sendTyping = async (req, res) => {
  await messageService.sendTyping(req, res);
};

export const sendFiles = async (req, res) => {
  await messageService.sendFiles(req, res);
};

export const sendBubble = async (req, res) => {
  await messageService.sendBubble(req, res);
}; 