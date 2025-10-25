/**
 * @module AgentFactory
 * @description Factory class to create agent instances based on configuration.
 */

import { loggerUtils } from '../utils/logger.js';
import { HttpAgent } from './HttpAgent.js';

class AgentFactory {
    /**
     * Creates an agent instance based on the provided agent data.
     * 
     * @param {Object} agentData - The agent configuration data.
     *                             Should include `agent_url`, `settings`, etc.
     * @returns {Object|null} - An instance of an agent or null if no agent could be created.
     */
    static createAgent(agentData) {
        try {
            if (!agentData) {
                loggerUtils.warn('No agent data provided, cannot create agent');
                return null;
            }
            
            // Log agent data for debugging
            loggerUtils.debug({
                module: 'AgentFactory',
                message: 'Creating agent with data',
                agentData: {
                    hasAgentUrl: !!agentData.agent_url,
                    hasSettings: !!agentData.settings
                }
            });
            
            // For now, we only support HTTP agents.
            // It's identified by the presence of an `agent_url`.
            if (agentData.agent_url) {
                loggerUtils.debug({
                    module: 'AgentFactory',
                    message: 'Creating HttpAgent',
                    agentUrl: agentData.agent_url
                });
                
                // Verify the URL format before creating the agent
                try {
                    const parsedUrl = new URL(agentData.agent_url);
                    loggerUtils.info({
                        module: 'AgentFactory',
                        message: 'Agent URL validated before creating agent',
                        protocol: parsedUrl.protocol,
                        hostname: parsedUrl.hostname,
                        port: parsedUrl.port,
                        pathname: parsedUrl.pathname
                    });
                } catch (urlError) {
                    loggerUtils.error({
                        module: 'AgentFactory',
                        message: 'Invalid agent URL format',
                        agentUrl: agentData.agent_url,
                        error: urlError.message
                    });
                    // Continue anyway, let HttpAgent constructor handle the error
                }
                
                return new HttpAgent({
                    agentUrl: agentData.agent_url,
                    settings: agentData.settings || {}
                });
            }
            
            loggerUtils.warn('No supported agent type found in agent data');
            return null;
        } catch (error) {
            loggerUtils.error({
                module: 'AgentFactory',
                message: 'Error creating agent',
                error: error.message,
                stack: error.stack
            });
            return null;
        }
    }
}

export { AgentFactory }; 