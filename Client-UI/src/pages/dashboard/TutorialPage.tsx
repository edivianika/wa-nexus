
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const TutorialPage = () => {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">Tutorials</h1>
        <p className="text-muted-foreground">
          Learn how to integrate and use the WA Nexus API with step-by-step guides.
        </p>
      </div>
      
      <Tabs defaultValue="quickstart" className="space-y-4">
        <TabsList>
          <TabsTrigger value="quickstart">Quick Start</TabsTrigger>
          <TabsTrigger value="nodejs">Node.js</TabsTrigger>
          <TabsTrigger value="python">Python</TabsTrigger>
          <TabsTrigger value="webhook">Setting Up Webhooks</TabsTrigger>
          <TabsTrigger value="chatbot">Building a Chatbot</TabsTrigger>
        </TabsList>
        
        <TabsContent value="quickstart" className="space-y-6">
          <div className="prose max-w-none">
            <h2>Quick Start Guide</h2>
            <p>
              Get started with WA Nexus API in just a few steps.
            </p>
            
            <h3>Step 1: Create an Account</h3>
            <p>
              If you haven't already, create an account on WA Nexus and log in to your dashboard.
            </p>
            
            <h3>Step 2: Add a Device</h3>
            <p>
              Navigate to the Devices page and click "Add Device" to create a new WhatsApp connection.
            </p>
            
            <h3>Step 3: Connect Your WhatsApp</h3>
            <p>
              Scan the QR code with your WhatsApp app to link your device.
            </p>
            
            <div className="flex items-center justify-center p-6 border rounded-lg my-4">
              <div className="text-center space-y-2">
                <div className="w-32 h-32 bg-primary/10 mx-auto rounded-md flex items-center justify-center">
                  <span className="text-primary">[QR Code Placeholder]</span>
                </div>
                <p className="text-sm text-muted-foreground">Example QR code</p>
              </div>
            </div>
            
            <h3>Step 4: Note Your API Key</h3>
            <p>
              Once your device is connected, you'll receive an API key. Keep this key secure as you'll need it for all API requests.
            </p>
            
            <h3>Step 5: Send Your First Message</h3>
            <p>
              Use the API to send a test message to your own number:
            </p>
            
            <div className="bg-muted p-3 rounded-md font-mono text-sm mb-4">
{`curl -X POST https://api.wa-nexus.com/v1/messages \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "device_id": "YOUR_DEVICE_ID",
    "to": "YOUR_PHONE_NUMBER",
    "type": "text",
    "text": {
      "body": "Hello from WA Nexus API!"
    }
  }'`}
            </div>
            
            <h3>Next Steps</h3>
            <p>
              Now that you've sent your first message, explore the other tutorials to learn more about:
            </p>
            <ul>
              <li>Setting up webhooks to receive messages</li>
              <li>Sending media messages (images, documents, etc.)</li>
              <li>Building a chatbot</li>
              <li>Using templates for structured messages</li>
            </ul>
          </div>
        </TabsContent>
        
        <TabsContent value="nodejs" className="space-y-6">
          <div className="prose max-w-none">
            <h2>Node.js Integration Guide</h2>
            
            <h3>Installation</h3>
            <p>
              First, install the WA Nexus client library using npm:
            </p>
            
            <div className="bg-muted p-3 rounded-md font-mono text-sm mb-4">
              npm install wa-nexus-client
            </div>
            
            <h3>Basic Setup</h3>
            <p>
              Create a new Node.js project and initialize the WA Nexus client:
            </p>
            
            <div className="bg-muted p-3 rounded-md font-mono text-sm mb-4">
{`// Import the library
const WaNexus = require('wa-nexus-client');

// Initialize the client with your API key
const client = new WaNexus({
  apiKey: 'YOUR_API_KEY'
});

// Test connection
async function testConnection() {
  try {
    const devices = await client.listDevices();
    console.log('Connected devices:', devices);
  } catch (error) {
    console.error('Error connecting to WA Nexus:', error);
  }
}

testConnection();`}
            </div>
            
            <h3>Sending Messages</h3>
            
            <div className="bg-muted p-3 rounded-md font-mono text-sm mb-4">
{`// Send a text message
async function sendTextMessage(deviceId, to, message) {
  try {
    const response = await client.sendMessage({
      device_id: deviceId,
      to: to,
      type: 'text',
      text: {
        body: message
      }
    });
    
    console.log('Message sent:', response);
    return response;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

// Send an image
async function sendImageMessage(deviceId, to, imageUrl, caption) {
  try {
    const response = await client.sendMessage({
      device_id: deviceId,
      to: to,
      type: 'image',
      image: {
        url: imageUrl,
        caption: caption
      }
    });
    
    console.log('Image sent:', response);
    return response;
  } catch (error) {
    console.error('Error sending image:', error);
    throw error;
  }
}

// Usage examples
sendTextMessage('dev_abc123', '+1234567890', 'Hello from Node.js!');
sendImageMessage('dev_abc123', '+1234567890', 
  'https://example.com/images/product.jpg', 
  'Check out our new product!');`}
            </div>
            
            <h3>Setting Up a Webhook Server</h3>
            
            <div className="bg-muted p-3 rounded-md font-mono text-sm mb-4">
{`const express = require('express');
const app = express();
app.use(express.json());

// Webhook endpoint to receive WhatsApp messages
app.post('/webhook', (req, res) => {
  const { event, device_id, message } = req.body;
  
  console.log('Webhook received:', {
    event,
    deviceId: device_id,
    message
  });
  
  // Process the message
  if (message && message.type === 'text') {
    processIncomingMessage(message);
  }
  
  // Always acknowledge receipt
  res.status(200).send('OK');
});

// Process incoming messages
function processIncomingMessage(message) {
  const sender = message.from;
  const text = message.text.body;
  
  console.log(\`Message from \${sender}: \${text}\`);
  
  // Example: Auto-respond to incoming messages
  if (text.toLowerCase().includes('hello')) {
    sendTextMessage('dev_abc123', sender, 'Hello! How can I assist you today?');
  }
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Webhook server running on port \${PORT}\`);
});`}
            </div>
            
            <h3>Express.js Example Application</h3>
            <p>
              Here's a complete example of a simple Express.js application that integrates with WA Nexus:
            </p>
            
            <div className="bg-muted p-3 rounded-md font-mono text-sm mb-4">
{`const express = require('express');
const WaNexus = require('wa-nexus-client');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize WA Nexus client
const client = new WaNexus({
  apiKey: process.env.WA_NEXUS_API_KEY
});

// Home route
app.get('/', (req, res) => {
  res.send('WA Nexus Integration Example');
});

// API route to send messages
app.post('/api/send-message', async (req, res) => {
  const { deviceId, to, message } = req.body;
  
  if (!deviceId || !to || !message) {
    return res.status(400).json({
      error: 'Missing required fields: deviceId, to, message'
    });
  }
  
  try {
    const response = await client.sendMessage({
      device_id: deviceId,
      to: to,
      type: 'text',
      text: {
        body: message
      }
    });
    
    res.json({
      success: true,
      message: 'Message sent successfully',
      response
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Webhook endpoint
app.post('/webhook', (req, res) => {
  const { event, device_id, message } = req.body;
  
  console.log('Webhook received:', {
    event,
    deviceId: device_id,
    message
  });
  
  // Process message and auto-respond
  if (message && message.type === 'text') {
    const sender = message.from;
    const text = message.text.body.toLowerCase();
    
    if (text.includes('hello') || text.includes('hi')) {
      client.sendMessage({
        device_id,
        to: sender,
        type: 'text',
        text: {
          body: 'Hello! Thank you for contacting us. How can we help you today?'
        }
      }).catch(err => console.error('Error sending auto-response:', err));
    }
  }
  
  res.status(200).send('OK');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`}
            </div>
            
            <h3>Additional Resources</h3>
            <ul>
              <li><a href="#">WA Nexus Node.js Client GitHub Repository</a></li>
              <li><a href="#">Advanced Node.js Examples</a></li>
              <li><a href="#">Handling Media Messages in Node.js</a></li>
            </ul>
          </div>
        </TabsContent>
        
        <TabsContent value="python" className="space-y-6">
          <div className="prose max-w-none">
            <h2>Python Integration Guide</h2>
            
            <h3>Installation</h3>
            <p>
              Install the WA Nexus Python client using pip:
            </p>
            
            <div className="bg-muted p-3 rounded-md font-mono text-sm mb-4">
              pip install wa-nexus-python
            </div>
            
            <h3>Basic Setup</h3>
            
            <div className="bg-muted p-3 rounded-md font-mono text-sm mb-4">
{`import wa_nexus

# Initialize the client
client = wa_nexus.Client(api_key="YOUR_API_KEY")

# Test connection
def test_connection():
    try:
        devices = client.list_devices()
        print(f"Connected devices: {devices}")
    except Exception as e:
        print(f"Error connecting to WA Nexus: {e}")

test_connection()`}
            </div>
            
            <h3>Sending Messages</h3>
            
            <div className="bg-muted p-3 rounded-md font-mono text-sm mb-4">
{`# Send a text message
def send_text_message(device_id, to, message):
    try:
        response = client.send_message(
            device_id=device_id,
            to=to,
            type="text",
            text={"body": message}
        )
        print(f"Message sent: {response}")
        return response
    except Exception as e:
        print(f"Error sending message: {e}")
        raise e

# Send an image
def send_image_message(device_id, to, image_url, caption=None):
    try:
        response = client.send_message(
            device_id=device_id,
            to=to,
            type="image",
            image={
                "url": image_url,
                "caption": caption
            }
        )
        print(f"Image sent: {response}")
        return response
    except Exception as e:
        print(f"Error sending image: {e}")
        raise e

# Usage examples
send_text_message("dev_abc123", "+1234567890", "Hello from Python!")
send_image_message(
    "dev_abc123",
    "+1234567890",
    "https://example.com/images/product.jpg",
    "Check out our new product!"
)`}
            </div>
            
            <h3>Setting Up a Webhook Server with Flask</h3>
            
            <div className="bg-muted p-3 rounded-md font-mono text-sm mb-4">
{`from flask import Flask, request, jsonify
import wa_nexus

app = Flask(__name__)
client = wa_nexus.Client(api_key="YOUR_API_KEY")

@app.route('/webhook', methods=['POST'])
def webhook():
    data = request.json
    
    event = data.get('event')
    device_id = data.get('device_id')
    message = data.get('message')
    
    print(f"Webhook received: event={event}, device_id={device_id}")
    
    if message and message.get('type') == 'text':
        process_message(message, device_id)
    
    # Always acknowledge receipt
    return jsonify({"status": "ok"}), 200

def process_message(message, device_id):
    sender = message.get('from')
    text = message.get('text', {}).get('body', '')
    
    print(f"Message from {sender}: {text}")
    
    # Example: Auto-respond to incoming messages
    if 'hello' in text.lower():
        client.send_message(
            device_id=device_id,
            to=sender,
            type="text",
            text={"body": "Hello! How can I assist you today?"}
        )

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)`}
            </div>
            
            <h3>Complete Flask Application Example</h3>
            
            <div className="bg-muted p-3 rounded-md font-mono text-sm mb-4">
{`from flask import Flask, request, jsonify, render_template
import wa_nexus
import os
from dotenv import load_dotenv

load_dotenv()  # Load environment variables from .env file

app = Flask(__name__)
client = wa_nexus.Client(api_key=os.getenv("WA_NEXUS_API_KEY"))

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/send-message', methods=['POST'])
def send_message():
    data = request.json
    device_id = data.get('deviceId')
    to = data.get('to')
    message = data.get('message')
    
    if not all([device_id, to, message]):
        return jsonify({
            'success': False,
            'error': 'Missing required fields: deviceId, to, message'
        }), 400
    
    try:
        response = client.send_message(
            device_id=device_id,
            to=to,
            type="text",
            text={"body": message}
        )
        
        return jsonify({
            'success': True,
            'message': 'Message sent successfully',
            'response': response
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/webhook', methods=['POST'])
def webhook():
    data = request.json
    
    event = data.get('event')
    device_id = data.get('device_id')
    message = data.get('message')
    
    print(f"Webhook received: {data}")
    
    # Process message
    if message and message.get('type') == 'text':
        sender = message.get('from')
        text = message.get('text', {}).get('body', '').lower()
        
        # Auto-respond to customer inquiries
        if 'pricing' in text:
            auto_response = "Thank you for your interest in our pricing! Please visit our website at example.com/pricing for more information."
        elif 'support' in text:
            auto_response = "Our support team is here to help. Please describe your issue and we'll assist you shortly."
        elif any(greeting in text for greeting in ['hello', 'hi', 'hey']):
            auto_response = "Hello! Thank you for reaching out. How can we assist you today?"
        else:
            auto_response = "Thank you for your message. Our team will get back to you soon."
            
        # Send the auto-response
        try:
            client.send_message(
                device_id=device_id,
                to=sender,
                type="text", 
                text={"body": auto_response}
            )
        except Exception as e:
            print(f"Error sending auto-response: {e}")
    
    return jsonify({"status": "ok"}), 200

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)`}
            </div>
            
            <h3>Additional Resources</h3>
            <ul>
              <li><a href="#">WA Nexus Python Client Documentation</a></li>
              <li><a href="#">Python Examples Repository</a></li>
              <li><a href="#">Deploying Flask Webhooks to Production</a></li>
            </ul>
          </div>
        </TabsContent>
        
        <TabsContent value="webhook" className="space-y-6">
          <div className="prose max-w-none">
            <h2>Setting Up Webhooks</h2>
            <p>
              Webhooks allow your application to receive real-time notifications when events occur in your WhatsApp account.
            </p>
            
            <h3>What are Webhooks?</h3>
            <p>
              Webhooks are HTTP callbacks that are triggered by specific events. When a specified event occurs, WA Nexus will send an HTTP POST request to the URL you configure, containing data about the event.
            </p>
            
            <h3>Events You Can Subscribe To</h3>
            <ul>
              <li><strong>message_received</strong> - When a new message is received</li>
              <li><strong>message_status_update</strong> - When the status of a message changes (sent, delivered, read)</li>
              <li><strong>device_status_update</strong> - When the status of your device changes (connected, disconnected)</li>
              <li><strong>message_reaction</strong> - When someone reacts to a message</li>
            </ul>
            
            <h3>Setting Up Your Webhook URL</h3>
            <p>
              Follow these steps to configure your webhook:
            </p>
            <ol>
              <li>
                <strong>Create an endpoint on your server</strong> to receive webhook requests. This endpoint should:
                <ul>
                  <li>Accept HTTP POST requests</li>
                  <li>Parse JSON request bodies</li>
                  <li>Return a 200 OK response to acknowledge receipt</li>
                </ul>
              </li>
              <li>
                <strong>Make your endpoint publicly accessible</strong>. Your server needs to be accessible from the internet. You can use services like ngrok for development or testing.
              </li>
              <li>
                <strong>Add your webhook URL in the device settings</strong>. In your WA Nexus dashboard, go to the Devices page, select your device, and enter your webhook URL.
              </li>
            </ol>
            
            <div className="mb-4 p-6 border rounded-lg bg-muted/50">
              <h4>Important Security Considerations</h4>
              <ol>
                <li>Use HTTPS for your webhook URL to ensure data is encrypted in transit.</li>
                <li>Implement authentication for your webhook to verify that requests come from WA Nexus.</li>
                <li>Validate the payload of incoming webhook requests before processing them.</li>
              </ol>
            </div>
            
            <h3>Webhook Authentication</h3>
            <p>
              All webhook requests include a <code>X-WA-Nexus-Signature</code> header that you can use to verify the authenticity of the request.
            </p>
            
            <div className="bg-muted p-3 rounded-md font-mono text-sm mb-4">
{`// Node.js example for verifying webhook signatures
const crypto = require('crypto');
const express = require('express');
const app = express();
app.use(express.json());

// Your webhook secret (should match what's in your dashboard)
const WEBHOOK_SECRET = 'your-webhook-secret';

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-wa-nexus-signature'];
  const body = req.body;
  
  // Verify signature
  if (!isValidSignature(signature, JSON.stringify(body), WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process webhook
  console.log('Valid webhook received:', body);
  
  res.status(200).send('OK');
});

function isValidSignature(signature, payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const calculatedSignature = hmac.digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(calculatedSignature)
  );
}

app.listen(3000, () => {
  console.log('Webhook server running on port 3000');
});`}
            </div>
            
            <h3>Testing Your Webhook</h3>
            <p>
              After setting up your webhook, you can test it in several ways:
            </p>
            <ol>
              <li><strong>Send a test message</strong> using the API, and watch for delivery status updates.</li>
              <li><strong>Send a message to your WhatsApp number</strong> and see if your webhook receives the notification.</li>
              <li><strong>Use the "Test Webhook" button</strong> in the device settings page to send a test payload.</li>
            </ol>
            
            <h3>Handling Webhook Failures</h3>
            <p>
              If your webhook endpoint fails to respond with a 200 OK status code, WA Nexus will:
            </p>
            <ol>
              <li>Retry the webhook delivery up to 5 times with exponential backoff</li>
              <li>After all retries fail, mark the webhook as failed in your dashboard</li>
              <li>You can manually trigger redelivery for failed webhooks from your dashboard</li>
            </ol>
            
            <h3>Best Practices</h3>
            <ul>
              <li>Process webhooks asynchronously to avoid blocking your webhook handler</li>
              <li>Implement idempotency checks to handle duplicate webhook deliveries</li>
              <li>Log all webhook requests for debugging purposes</li>
              <li>Set up monitoring for your webhook endpoint</li>
            </ul>
          </div>
        </TabsContent>
        
        <TabsContent value="chatbot" className="space-y-6">
          <div className="prose max-w-none">
            <h2>Building a WhatsApp Chatbot</h2>
            <p>
              Learn how to build an automated chatbot using the WA Nexus API.
            </p>
            
            <h3>Chatbot Architecture</h3>
            <p>
              A basic WhatsApp chatbot consists of these components:
            </p>
            <ol>
              <li><strong>Webhook Endpoint</strong>: Receives incoming messages from users</li>
              <li><strong>Message Processor</strong>: Parses and understands user messages</li>
              <li><strong>Response Generator</strong>: Creates appropriate responses</li>
              <li><strong>WA Nexus API Client</strong>: Sends responses back to users</li>
            </ol>
            
            <h3>Simple Rule-Based Chatbot Example</h3>
            
            <div className="bg-muted p-3 rounded-md font-mono text-sm mb-4">
{`// Node.js example of a simple rule-based chatbot
const express = require('express');
const WaNexus = require('wa-nexus-client');
require('dotenv').config();

const app = express();
app.use(express.json());

// Initialize WA Nexus client
const client = new WaNexus({
  apiKey: process.env.WA_NEXUS_API_KEY
});

// Define chatbot responses
const responses = {
  hello: "Hi there! How can I help you today?",
  help: "I can help you with: \n- Product information \n- Pricing \n- Order status \n- Contact support",
  pricing: "Our product pricing: \n- Basic: $10/month \n- Pro: $25/month \n- Enterprise: $50/month",
  contact: "You can reach our support team at support@example.com or call us at +1-234-567-8900.",
  default: "I'm not sure how to respond to that. Type 'help' to see what I can assist you with."
};

// Webhook to receive incoming messages
app.post('/webhook', async (req, res) => {
  try {
    const { event, device_id, message } = req.body;
    
    // Only process incoming messages
    if (event !== 'message_received' || !message || message.type !== 'text') {
      return res.status(200).send('OK');
    }
    
    const sender = message.from;
    const text = message.text.body.toLowerCase().trim();
    
    // Generate response based on user input
    let responseText = responses.default;
    
    if (text.includes('hello') || text.includes('hi')) {
      responseText = responses.hello;
    } else if (text.includes('help')) {
      responseText = responses.help;
    } else if (text.includes('price') || text.includes('cost')) {
      responseText = responses.pricing;
    } else if (text.includes('contact') || text.includes('support')) {
      responseText = responses.contact;
    }
    
    // Send response back to the user
    await client.sendMessage({
      device_id,
      to: sender,
      type: 'text',
      text: {
        body: responseText
      }
    });
    
    console.log(\`Sent response to \${sender}: \${responseText.substring(0, 50)}...\`);
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Chatbot server running on port \${PORT}\`);
});`}
            </div>
            
            <h3>Adding Interactive Elements</h3>
            <p>
              You can make your chatbot more engaging by using interactive message elements:
            </p>
            
            <div className="bg-muted p-3 rounded-md font-mono text-sm mb-4">
{`// Send a message with buttons
async function sendButtonMessage(deviceId, to, text, buttons) {
  try {
    const response = await client.sendMessage({
      device_id: deviceId,
      to: to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: text
        },
        action: {
          buttons: buttons.map(button => ({
            type: 'reply',
            reply: {
              id: button.id,
              title: button.title
            }
          }))
        }
      }
    });
    
    return response;
  } catch (error) {
    console.error('Error sending button message:', error);
    throw error;
  }
}

// Example usage
sendButtonMessage(
  'dev_abc123',
  '+1234567890',
  'Please select an option:',
  [
    { id: 'pricing', title: 'View Pricing' },
    { id: 'support', title: 'Contact Support' },
    { id: 'faq', title: 'Read FAQs' }
  ]
);`}
            </div>
            
            <h3>Adding Conversational Context</h3>
            <p>
              To build a more sophisticated chatbot, you need to maintain conversational context:
            </p>
            
            <div className="bg-muted p-3 rounded-md font-mono text-sm mb-4">
{`// Using a simple in-memory store for conversation context
// Note: In production, use a database instead
const conversations = {};

// Webhook handler with conversation context
app.post('/webhook', async (req, res) => {
  try {
    const { event, device_id, message } = req.body;
    
    if (event !== 'message_received' || !message || message.type !== 'text') {
      return res.status(200).send('OK');
    }
    
    const sender = message.from;
    const text = message.text.body.toLowerCase().trim();
    
    // Get or initialize conversation context
    if (!conversations[sender]) {
      conversations[sender] = {
        stage: 'welcome',
        data: {}
      };
    }
    
    const conversation = conversations[sender];
    let responseText = '';
    
    switch(conversation.stage) {
      case 'welcome':
        responseText = 'Hi there! What would you like to know about? (products, pricing, or support)';
        conversation.stage = 'menu';
        break;
        
      case 'menu':
        if (text.includes('product')) {
          responseText = 'We offer a range of products. Which category are you interested in? (software, hardware, services)';
          conversation.stage = 'products';
        } else if (text.includes('pricing')) {
          responseText = 'Our pricing: Basic ($10/mo), Pro ($25/mo), Enterprise ($50/mo). Which plan would you like details on?';
          conversation.stage = 'pricing';
        } else if (text.includes('support')) {
          responseText = 'For support, please provide your order number or describe your issue.';
          conversation.stage = 'support';
        } else {
          responseText = "I didn't understand. Please choose products, pricing, or support.";
        }
        break;
        
      case 'products':
        // Handle product inquiries
        conversation.data.category = text;
        responseText = \`Great! Here's information about our \${text} products...\`;
        conversation.stage = 'menu';
        break;
        
      case 'pricing':
        // Handle pricing inquiries
        responseText = \`The details for the \${text} plan are...\`;
        conversation.stage = 'menu';
        break;
        
      case 'support':
        // Handle support inquiries
        conversation.data.issue = text;
        responseText = \`Thanks for providing that information. Our support team will contact you about "\${text}" within 24 hours.\`;
        conversation.stage = 'menu';
        break;
        
      default:
        responseText = "Let's start over. What would you like to know about? (products, pricing, or support)";
        conversation.stage = 'menu';
    }
    
    // Send the response
    await client.sendMessage({
      device_id,
      to: sender,
      type: 'text',
      text: { body: responseText }
    });
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});`}
            </div>
            
            <h3>Advanced Chatbot Features</h3>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-lg font-medium mb-2">Natural Language Processing</h3>
                  <p className="text-muted-foreground">Integrate with NLP services like Dialogflow or OpenAI to understand user intent better.</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-lg font-medium mb-2">Multi-language Support</h3>
                  <p className="text-muted-foreground">Detect language and respond in the user's preferred language.</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-lg font-medium mb-2">Human Handoff</h3>
                  <p className="text-muted-foreground">Allow the chatbot to transfer complex conversations to human agents.</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-lg font-medium mb-2">Analytics & Reporting</h3>
                  <p className="text-muted-foreground">Track chatbot performance and user satisfaction to improve responses.</p>
                </CardContent>
              </Card>
            </div>
            
            <h3>Resources for Building Advanced Chatbots</h3>
            <ul>
              <li><a href="#">Dialogflow Integration Guide</a></li>
              <li><a href="#">OpenAI Integration Example</a></li>
              <li><a href="#">Building Conversational Flows</a></li>
              <li><a href="#">Chatbot Analytics Dashboard</a></li>
            </ul>
            
            <div className="mt-6 p-4 border rounded-lg bg-primary/5">
              <h4 className="text-lg font-medium mb-2">Ready to Build Your Own Chatbot?</h4>
              <p className="mb-4">Start with our simple examples and gradually add more sophisticated features as you go.</p>
              <Button>Download Chatbot Starter Code</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TutorialPage;
