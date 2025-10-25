import axios from 'axios';
import { IAgent } from './IAgent.js';
import { loggerUtils } from '../utils/logger.js';

/**
 * @class HttpAgent
 * @extends IAgent
 * @description An agent implementation that processes messages by making a POST request
 * to an external HTTP endpoint (agentUrl).
 */
class HttpAgent extends IAgent {
    /**
     * Constructor for HttpAgent.
     * @param {object} config - Configuration object.
     * @param {string} config.agentUrl - The URL of the external agent service.
     * @param {object} [config.settings={}] - Additional settings to be passed to the agent.
     */
    constructor(config) {
        super(config);
        if (!config || !config.agentUrl) {
            throw new Error('HttpAgent requires a config object with an agentUrl property.');
        }
        this.agentUrl = config.agentUrl;
        this.settings = config.settings || {};
        
        // Log the agent URL for debugging
        loggerUtils.debug({
            module: 'HttpAgent',
            message: 'HttpAgent initialized',
            agentUrl: this.agentUrl
        });
        
        // Verify and parse the URL for additional logging
        try {
            const parsedUrl = new URL(this.agentUrl);
            loggerUtils.info({
                module: 'HttpAgent',
                message: 'Agent URL verified and parsed',
                protocol: parsedUrl.protocol,
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                pathname: parsedUrl.pathname,
                full_url: this.agentUrl
            });
        } catch (urlError) {
            loggerUtils.error({
                module: 'HttpAgent',
                message: 'Invalid agent URL format',
                agentUrl: this.agentUrl,
                error: urlError.message
            });
        }
    }

    /**
     * Processes the message by sending it to the configured agentUrl.
     *
     * @param {object} messagePayload - The simplified message data.
     * @param {object} connectionInfo - Information about the WhatsApp connection.
     * @returns {Promise<any>} A promise that resolves with the data from the agent's response.
     */
    async process(messagePayload, connectionInfo) {
        if (!this.isReady()) {
            loggerUtils.warn({
                module: 'HttpAgent',
                connectionId: connectionInfo.id,
                message: 'HttpAgent is not ready or configured, skipping processing.'
            });
            return null;
        }

        const payload = {
            message: messagePayload,
            connection: connectionInfo,
            settings: this.settings,
        };

        try {
            loggerUtils.info({
                module: 'HttpAgent',
                connectionId: connectionInfo.id,
                message: `Sending message to agent at ${this.agentUrl}`
            });

            const response = await axios.post(this.agentUrl, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000, // 30 second timeout
            });

            loggerUtils.info({
                module: 'HttpAgent',
                connectionId: connectionInfo.id,
                message: 'Successfully received response from agent.'
            });

            return response.data;
        } catch (error) {
            loggerUtils.error({
                module: 'HttpAgent',
                connectionId: connectionInfo.id,
                message: `Error calling agent endpoint ${this.agentUrl}`,
                error: error.message,
                stack: error.stack,
                payload,
            });
            // Rethrow the error to be handled by the caller
            throw new Error(`Failed to get response from agent: ${error.message}`);
        }
    }

    /**
     * Checks if the agent has a valid URL.
     * @returns {boolean} True if agentUrl is set.
     */
    isReady() {
        return !!this.agentUrl;
    }
}

export { HttpAgent }; 