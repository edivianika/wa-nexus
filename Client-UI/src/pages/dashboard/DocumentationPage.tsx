import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CheckCircle, ClipboardCheck, Palette } from "lucide-react";
import { Link } from "react-router-dom";

const DocumentationPage = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopyCode = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">API Documentation</h1>
        <p className="text-muted-foreground">
          Comprehensive guide to using the WA Nexus API for WhatsApp messaging.
        </p>
      </div>

      <div className="bg-primary/10 rounded-lg p-4 border border-primary/20">
        <div className="flex items-start gap-3">
          <Palette className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-medium text-lg mb-1">New UI Theme Available</h3>
            <p className="text-muted-foreground mb-3">
              We've updated our UI with a fresh new theme inspired by Menu Stock Oracle design. Check out the new components and styling.
            </p>
            <Link to="/dashboard/ui-demo">
              <Button variant="outline" className="animated-button">
                View UI Demo
              </Button>
            </Link>
          </div>
        </div>
      </div>
      
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="authentication">Authentication</TabsTrigger>
          <TabsTrigger value="sending">Sending Messages</TabsTrigger>
          <TabsTrigger value="receiving">Receiving Messages</TabsTrigger>
          <TabsTrigger value="media">Media Handling</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <div className="prose max-w-none">
            <h2>Getting Started with WA Nexus API</h2>
            <p>
              The WA Nexus API allows you to integrate WhatsApp messaging into your applications. This documentation provides detailed information about the API endpoints, request/response formats, and examples.
            </p>
            
            <h3>Base URL</h3>
            <div className="bg-muted p-3 rounded-md font-mono text-sm">
              https://api.wa-nexus.com/v1
            </div>
            
            <h3>API Features</h3>
            <ul>
              <li>Send text messages, media files, and documents</li>
              <li>Receive incoming messages via webhooks</li>
              <li>Create and manage message templates</li>
              <li>Track message delivery status</li>
              <li>Manage multiple WhatsApp devices/numbers</li>
            </ul>
            
            <h3>Requirements</h3>
            <p>
              To use the WA Nexus API, you need:
            </p>
            <ul>
              <li>A registered account on WA Nexus</li>
              <li>At least one connected WhatsApp device</li>
              <li>An API key for authentication</li>
            </ul>
          </div>
        </TabsContent>
        
        <TabsContent value="authentication" className="space-y-4">
          <div className="prose max-w-none">
            <h2>Authentication</h2>
            <p>
              All API requests must include your API key in the Authorization header using Bearer token authentication.
            </p>
            
            <h3>Headers</h3>
            <div className="bg-muted p-3 rounded-md font-mono text-sm">
              Authorization: Bearer YOUR_API_KEY<br />
              Content-Type: application/json
            </div>
            
            <h3>Example Request</h3>
            
            <div className="relative">
              <pre className="bg-muted p-3 rounded-md font-mono text-sm overflow-auto">
{`curl -X GET https://api.wa-nexus.com/v1/devices \\
  -H "Authorization: Bearer wha_1234567890abcdefghijk" \\
  -H "Content-Type: application/json"`}
              </pre>
              <Button
                variant="outline"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={() => handleCopyCode(`curl -X GET https://api.wa-nexus.com/v1/devices \\
  -H "Authorization: Bearer wha_1234567890abcdefghijk" \\
  -H "Content-Type: application/json"`, 1)}
              >
                {copiedIndex === 1 ? 
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : 
                  <ClipboardCheck className="h-3.5 w-3.5" />
                }
              </Button>
            </div>
            
            <h3>API Key Security</h3>
            <p>
              Keep your API key secure and never expose it in client-side code or public repositories. You can generate, revoke, and manage API keys from the Devices page in your dashboard.
            </p>
          </div>
        </TabsContent>
        
        <TabsContent value="sending" className="space-y-4">
          <div className="prose max-w-none">
            <h2>Sending Messages</h2>
            <p>
              Send text messages, media, or documents to any WhatsApp number using the API.
            </p>
            
            <h3>Send Text Message</h3>
            <p>
              <strong>Endpoint:</strong> POST /messages
            </p>
            
            <div className="relative">
              <pre className="bg-muted p-3 rounded-md font-mono text-sm overflow-auto">
{`// Request
{
  "device_id": "dev_abc123",
  "to": "+1234567890",
  "type": "text",
  "text": {
    "body": "Hello from WA Nexus API!"
  }
}`}
              </pre>
              <Button
                variant="outline"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={() => handleCopyCode(`{
  "device_id": "dev_abc123",
  "to": "+1234567890",
  "type": "text",
  "text": {
    "body": "Hello from WA Nexus API!"
  }
}`, 2)}
              >
                {copiedIndex === 2 ? 
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : 
                  <ClipboardCheck className="h-3.5 w-3.5" />
                }
              </Button>
            </div>
            
            <h3>Code Examples</h3>
            
            <h4>JavaScript (Node.js)</h4>
            <div className="relative">
              <pre className="bg-muted p-3 rounded-md font-mono text-sm overflow-auto">
{`const axios = require('axios');

async function sendWhatsAppMessage() {
  try {
    const response = await axios.post('https://api.wa-nexus.com/v1/messages', {
      device_id: 'dev_abc123',
      to: '+1234567890',
      type: 'text',
      text: {
        body: 'Hello from WA Nexus API!'
      }
    }, {
      headers: {
        'Authorization': 'Bearer wha_1234567890abcdefghijk',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Message sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    throw error;
  }
}

sendWhatsAppMessage();`}
              </pre>
              <Button
                variant="outline"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={() => handleCopyCode(`const axios = require('axios');

async function sendWhatsAppMessage() {
  try {
    const response = await axios.post('https://api.wa-nexus.com/v1/messages', {
      device_id: 'dev_abc123',
      to: '+1234567890',
      type: 'text',
      text: {
        body: 'Hello from WA Nexus API!'
      }
    }, {
      headers: {
        'Authorization': 'Bearer wha_1234567890abcdefghijk',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Message sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    throw error;
  }
}

sendWhatsAppMessage();`, 3)}
              >
                {copiedIndex === 3 ? 
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : 
                  <ClipboardCheck className="h-3.5 w-3.5" />
                }
              </Button>
            </div>
            
            <h4>Python</h4>
            <div className="relative">
              <pre className="bg-muted p-3 rounded-md font-mono text-sm overflow-auto">
{`import requests
import json

def send_whatsapp_message():
    url = "https://api.wa-nexus.com/v1/messages"
    
    headers = {
        "Authorization": "Bearer wha_1234567890abcdefghijk",
        "Content-Type": "application/json"
    }
    
    data = {
        "device_id": "dev_abc123",
        "to": "+1234567890",
        "type": "text",
        "text": {
            "body": "Hello from WA Nexus API!"
        }
    }
    
    try:
        response = requests.post(url, headers=headers, data=json.dumps(data))
        response.raise_for_status()
        print("Message sent:", response.json())
        return response.json()
    except requests.exceptions.RequestException as e:
        print("Error sending message:", e)
        raise e

send_whatsapp_message()`}
              </pre>
              <Button
                variant="outline"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={() => handleCopyCode(`import requests
import json

def send_whatsapp_message():
    url = "https://api.wa-nexus.com/v1/messages"
    
    headers = {
        "Authorization": "Bearer wha_1234567890abcdefghijk",
        "Content-Type": "application/json"
    }
    
    data = {
        "device_id": "dev_abc123",
        "to": "+1234567890",
        "type": "text",
        "text": {
            "body": "Hello from WA Nexus API!"
        }
    }
    
    try:
        response = requests.post(url, headers=headers, data=json.dumps(data))
        response.raise_for_status()
        print("Message sent:", response.json())
        return response.json()
    except requests.exceptions.RequestException as e:
        print("Error sending message:", e)
        raise e

send_whatsapp_message()`, 4)}
              >
                {copiedIndex === 4 ? 
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : 
                  <ClipboardCheck className="h-3.5 w-3.5" />
                }
              </Button>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="receiving" className="space-y-4">
          <div className="prose max-w-none">
            <h2>Receiving Messages</h2>
            <p>
              To receive incoming messages from WhatsApp, you need to set up a webhook endpoint that WA Nexus can send notifications to.
            </p>
            
            <h3>Setting Up Webhooks</h3>
            <p>
              Configure your webhook URL in the device settings page. Your webhook server should:
            </p>
            <ul>
              <li>Accept POST requests</li>
              <li>Return a 200 OK response</li>
              <li>Process the webhook payload</li>
            </ul>
            
            <h3>Sample Webhook Payload</h3>
            <div className="relative">
              <pre className="bg-muted p-3 rounded-md font-mono text-sm overflow-auto">
{`{
  "event": "message_received",
  "device_id": "dev_abc123",
  "message": {
    "id": "msg_xyz789",
    "from": "+1987654321",
    "type": "text",
    "timestamp": "2025-04-12T15:30:45Z",
    "text": {
      "body": "Hello, how can I help you today?"
    }
  }
}`}
              </pre>
              <Button
                variant="outline"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={() => handleCopyCode(`{
  "event": "message_received",
  "device_id": "dev_abc123",
  "message": {
    "id": "msg_xyz789",
    "from": "+1987654321",
    "type": "text",
    "timestamp": "2025-04-12T15:30:45Z",
    "text": {
      "body": "Hello, how can I help you today?"
    }
  }
}`, 5)}
              >
                {copiedIndex === 5 ? 
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : 
                  <ClipboardCheck className="h-3.5 w-3.5" />
                }
              </Button>
            </div>
            
            <h3>Handling Webhooks (Node.js Example)</h3>
            <div className="relative">
              <pre className="bg-muted p-3 rounded-md font-mono text-sm overflow-auto">
{`const express = require('express');
const app = express();
app.use(express.json());

app.post('/webhook', (req, res) => {
  const { event, device_id, message } = req.body;
  
  console.log('Received webhook:', {
    event,
    device_id,
    messageFrom: message.from,
    messageType: message.type,
    messageContent: message.text?.body || message.media?.url
  });
  
  // Process the message based on type
  if (message.type === 'text') {
    // Handle text message
    const text = message.text.body;
    console.log('Text message:', text);
    
    // Example: Auto-respond to incoming messages
    if (text.toLowerCase().includes('hello')) {
      // Send a reply using your WA Nexus API client
      // sendReplyMessage(message.from, 'Hello there! How can I assist you?');
    }
  } else if (message.type === 'image') {
    // Handle image message
    console.log('Image received:', message.media.url);
  }
  
  // Always respond with 200 OK to acknowledge receipt
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Webhook server listening on port \${PORT}\`);
});`}
              </pre>
              <Button
                variant="outline"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={() => handleCopyCode(`const express = require('express');
const app = express();
app.use(express.json());

app.post('/webhook', (req, res) => {
  const { event, device_id, message } = req.body;
  
  console.log('Received webhook:', {
    event,
    device_id,
    messageFrom: message.from,
    messageType: message.type,
    messageContent: message.text?.body || message.media?.url
  });
  
  // Process the message based on type
  if (message.type === 'text') {
    // Handle text message
    const text = message.text.body;
    console.log('Text message:', text);
    
    // Example: Auto-respond to incoming messages
    if (text.toLowerCase().includes('hello')) {
      // Send a reply using your WA Nexus API client
      // sendReplyMessage(message.from, 'Hello there! How can I assist you?');
    }
  } else if (message.type === 'image') {
    // Handle image message
    console.log('Image received:', message.media.url);
  }
  
  // Always respond with 200 OK to acknowledge receipt
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Webhook server listening on port \${PORT}\`);
});`, 6)}
              >
                {copiedIndex === 6 ? 
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : 
                  <ClipboardCheck className="h-3.5 w-3.5" />
                }
              </Button>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="media" className="space-y-4">
          <div className="prose max-w-none">
            <h2>Media Handling</h2>
            <p>
              Send and receive images, audio, video, and documents through the WhatsApp API.
            </p>
            
            <h3>Sending Media Messages</h3>
            <p>
              <strong>Endpoint:</strong> POST /messages
            </p>
            
            <h4>Sending an Image</h4>
            <div className="relative">
              <pre className="bg-muted p-3 rounded-md font-mono text-sm overflow-auto">
{`{
  "device_id": "dev_abc123",
  "to": "+1234567890",
  "type": "image",
  "image": {
    "url": "https://example.com/images/product.jpg",
    "caption": "Our new product launch"
  }
}`}
              </pre>
              <Button
                variant="outline"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={() => handleCopyCode(`{
  "device_id": "dev_abc123",
  "to": "+1234567890",
  "type": "image",
  "image": {
    "url": "https://example.com/images/product.jpg",
    "caption": "Our new product launch"
  }
}`, 7)}
              >
                {copiedIndex === 7 ? 
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : 
                  <ClipboardCheck className="h-3.5 w-3.5" />
                }
              </Button>
            </div>
            
            <h4>Sending a Document</h4>
            <div className="relative">
              <pre className="bg-muted p-3 rounded-md font-mono text-sm overflow-auto">
{`{
  "device_id": "dev_abc123",
  "to": "+1234567890",
  "type": "document",
  "document": {
    "url": "https://example.com/files/brochure.pdf",
    "filename": "company_brochure.pdf"
  }
}`}
              </pre>
              <Button
                variant="outline"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={() => handleCopyCode(`{
  "device_id": "dev_abc123",
  "to": "+1234567890",
  "type": "document",
  "document": {
    "url": "https://example.com/files/brochure.pdf",
    "filename": "company_brochure.pdf"
  }
}`, 8)}
              >
                {copiedIndex === 8 ? 
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : 
                  <ClipboardCheck className="h-3.5 w-3.5" />
                }
              </Button>
            </div>
            
            <h3>Supported Media Types</h3>
            <ul>
              <li><strong>Images:</strong> JPG, PNG, WebP (max 5MB)</li>
              <li><strong>Audio:</strong> MP3, OGG, M4A (max 16MB)</li>
              <li><strong>Video:</strong> MP4, 3GP, MOV (max 16MB)</li>
              <li><strong>Documents:</strong> PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT (max 100MB)</li>
            </ul>
            
            <h3>Media Upload API</h3>
            <p>
              For larger files or to store media for reuse, you can first upload the media to our servers:
            </p>
            
            <p>
              <strong>Endpoint:</strong> POST /media
            </p>
            
            <div className="relative">
              <pre className="bg-muted p-3 rounded-md font-mono text-sm overflow-auto">
{`// This is a multipart/form-data request
// Form fields:
// - file: The media file to upload
// - type: The media type (image, audio, video, document)
// - device_id: Your device ID

// Example response:
{
  "media_id": "med_12345",
  "mime_type": "image/jpeg",
  "sha256": "a1b2c3d4e5f6...",
  "url": "https://api.wa-nexus.com/v1/media/med_12345"
}`}
              </pre>
              <Button
                variant="outline"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={() => handleCopyCode(`// This is a multipart/form-data request
// Form fields:
// - file: The media file to upload
// - type: The media type (image, audio, video, document)
// - device_id: Your device ID

// Example response:
{
  "media_id": "med_12345",
  "mime_type": "image/jpeg",
  "sha256": "a1b2c3d4e5f6...",
  "url": "https://api.wa-nexus.com/v1/media/med_12345"
}`, 9)}
              >
                {copiedIndex === 9 ? 
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : 
                  <ClipboardCheck className="h-3.5 w-3.5" />
                }
              </Button>
            </div>
            
            <p>
              After uploading, you can use the returned <code>url</code> in your message requests.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DocumentationPage;
