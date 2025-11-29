import express from 'express';

const router = express.Router();

/**
 * @route GET /api/docs/n8n
 * @desc Halaman dokumentasi untuk integrasi n8n
 * @access Public
 */
router.get('/n8n', (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp API Endpoints - AI Guide</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            margin: 0;
            padding: 20px;
        }
        
        .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            background: #2c3e50;
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            margin: 0;
            font-size: 2rem;
        }
        
        .header p {
            margin: 10px 0 0 0;
            opacity: 0.8;
        }
        
        .content {
            padding: 30px;
        }
        
        .endpoint {
            margin: 25px 0;
            padding: 20px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            background: #fafafa;
        }
        
        .endpoint-header {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .method {
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 0.8rem;
            margin-right: 10px;
            color: white;
        }
        
        .method.post { background: #27ae60; }
        .method.get { background: #3498db; }
        .method.put { background: #f39c12; }
        .method.delete { background: #e74c3c; }
        
        .url {
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 1.1rem;
            color: #2c3e50;
        }
        
        .description {
            color: #666;
            margin-bottom: 15px;
        }
        
        .params {
            margin: 15px 0;
        }
        
        .param {
            margin: 8px 0;
            padding: 8px;
            background: white;
            border-left: 3px solid #3498db;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9rem;
        }
        
        .required {
            border-left-color: #e74c3c;
        }
        
        .optional {
            border-left-color: #95a5a6;
        }
        
        .example {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 15px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9rem;
            margin: 15px 0;
            overflow-x: auto;
        }
        
        .response {
            background: #27ae60;
            color: white;
            padding: 15px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9rem;
            margin: 15px 0;
        }
        
        .error {
            background: #e74c3c;
            color: white;
            padding: 15px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9rem;
            margin: 15px 0;
        }
        
        .auth-info {
            background: #f39c12;
            color: white;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
        }
        
        .section-title {
            font-size: 1.5rem;
            color: #2c3e50;
            margin: 30px 0 20px 0;
            padding-bottom: 10px;
            border-bottom: 2px solid #ecf0f1;
        }
        
        .note {
            background: #ecf0f1;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
            border-left: 4px solid #3498db;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 WhatsApp API Endpoints</h1>
            <p>AI Guide - Simple endpoint reference for automation</p>
        </div>
        
        <div class="content">
            <div class="auth-info">
                <strong>🔐 Authentication Required:</strong> All endpoints require Bearer token in Authorization header<br>
                <code>Authorization: Bearer YOUR_API_TOKEN</code>
            </div>

            <h2 class="section-title">Core Messaging Endpoints</h2>

            <div class="endpoint">
                <div class="endpoint-header">
                    <span class="method post">POST</span>
                    <span class="url">/api/sendbroadcast</span>
                </div>
                <div class="description">Send text message to WhatsApp number</div>
                
                <div class="params">
                    <div class="param required">
                        <strong>to</strong> (string, required): WhatsApp number (format: 6281234567890)
                    </div>
                    <div class="param required">
                        <strong>message</strong> (string, required): Text message to send
                    </div>
                </div>
                
                <div class="example">
{
  "to": "6281234567890",
  "message": "Hello from API"
}
                </div>
                
                <div class="response">
{
  "success": true,
  "messageId": "3EB00A30DE8F79410A1034",
  "to": "6281234567890"
}
                </div>
            </div>

            <div class="endpoint">
                <div class="endpoint-header">
                    <span class="method post">POST</span>
                    <span class="url">/api/send-files</span>
                </div>
                <div class="description">Send media files (images, videos, documents) to WhatsApp</div>
                
                <div class="params">
                    <div class="param required">
                        <strong>to</strong> (string, required): WhatsApp number
                    </div>
                    <div class="param required">
                        <strong>files</strong> (file[], required): Media files to send
                    </div>
                    <div class="param optional">
                        <strong>caption</strong> (string, optional): Caption for media
                    </div>
                </div>
                
                <div class="note">
                    <strong>Content-Type:</strong> multipart/form-data
                </div>
            </div>

            <h2 class="section-title">Interaction Endpoints</h2>

            <div class="endpoint">
                <div class="endpoint-header">
                    <span class="method post">POST</span>
                    <span class="url">/api/typing</span>
                </div>
                <div class="description">Send typing indicator to show "typing..." status</div>
                
                <div class="params">
                    <div class="param required">
                        <strong>to</strong> (string, required): WhatsApp number
                    </div>
                    <div class="param optional">
                        <strong>duration</strong> (number, optional): Duration in seconds (default: 3)
                    </div>
                </div>
            </div>

            <div class="endpoint">
                <div class="endpoint-header">
                    <span class="method post">POST</span>
                    <span class="url">/api/read-receipt</span>
                </div>
                <div class="description">Mark message as read</div>
                
                <div class="params">
                    <div class="param required">
                        <strong>to</strong> (string, required): WhatsApp number
                    </div>
                    <div class="param required">
                        <strong>messageId</strong> (string, required): Message ID to mark as read
                    </div>
                </div>
            </div>

            <h2 class="section-title">Status & Monitoring</h2>

            <div class="endpoint">
                <div class="endpoint-header">
                    <span class="method get">GET</span>
                    <span class="url">/api/connection/status</span>
                </div>
                <div class="description">Check WhatsApp device connection status</div>
                
                <div class="response">
{
  "success": true,
  "status": "connected",
  "deviceName": "My Device",
  "lastSeen": "2025-01-27T10:30:00Z"
}
                </div>
            </div>

            <h2 class="section-title">Error Responses</h2>

            <div class="error">
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid or missing token"
}
            </div>

            <div class="error">
{
  "success": false,
  "error": "Quota Exceeded",
  "message": "Message quota limit reached",
  "feature": "messages_per_period"
}
            </div>

            <div class="error">
{
  "success": false,
  "error": "Device Disconnected",
  "message": "WhatsApp device not connected"
}
            </div>

            <h2 class="section-title">Common Error Codes</h2>
            
            <div class="note">
                <strong>401 Unauthorized:</strong> Invalid or missing API token<br>
                <strong>400 Bad Request:</strong> Invalid phone number format<br>
                <strong>429 Too Many Requests:</strong> Quota exceeded<br>
                <strong>503 Service Unavailable:</strong> Device disconnected
            </div>

            <h2 class="section-title">Quick Reference</h2>
            
            <div class="note">
                <strong>Base URL:</strong> http://localhost:3000/api<br>
                <strong>Phone Format:</strong> 6281234567890 (country code + number)<br>
                <strong>Content-Type:</strong> application/json (except send-files)<br>
                <strong>Rate Limit:</strong> Based on subscription plan
            </div>
        </div>
    </div>
</body>
</html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
});

export default router;
