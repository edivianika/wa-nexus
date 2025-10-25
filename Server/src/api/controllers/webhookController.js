import * as webhookService from '../services/webhookService.js';
 
export const updateWebhook = async (req, res) => {
  await webhookService.updateWebhook(req, res);
}; 