/**
 * @interface IAgent
 * @description Interface for all AI Agent implementations.
 *
 * This class defines the standard contract that all agent classes must follow.
 * It ensures that the core application can interact with any type of agent
 * (HTTP, local, specific AI provider) in a consistent way.
 */
class IAgent {
    /**
     * Constructor for the agent.
     * @param {object} config - The configuration object for the agent.
     *                          This may include URLs, API keys, settings, etc.
     */
    constructor(config) {
        if (this.constructor === IAgent) {
            throw new Error("IAgent is an interface and cannot be instantiated directly.");
        }
        this.config = config;
    }

    /**
     * Processes an incoming message and returns a response.
     * This method must be implemented by all concrete agent classes.
     *
     * @param {object} messagePayload - A simplified object containing essential message data.
     * @param {object} connectionInfo - Information about the current WhatsApp connection.
     * @returns {Promise<any>} A promise that resolves with the agent's response.
     */
    async process(messagePayload, connectionInfo) {
        throw new Error("The 'process' method must be implemented by the subclass.");
    }

    /**
     * A utility method to check if the agent is properly configured and ready to be used.
     *
     * @returns {boolean} True if the agent is ready, false otherwise.
     */
    isReady() {
        throw new Error("The 'isReady' method must be implemented by the subclass.");
    }
}

export { IAgent }; 