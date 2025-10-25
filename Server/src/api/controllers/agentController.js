import * as agentService from '../services/agentService.js';
 
export const updateAgent = async (req, res) => {
  await agentService.updateAgent(req, res);
}; 