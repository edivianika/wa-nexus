# Broadcast Server CORS Fix

## Problem
Broadcast requests from `https://3004.bulumerak.com` to broadcast server were failing due to CORS policy restrictions.

## Root Cause
The manual CORS middleware in `broadcastServer.js` was hardcoded to only allow `https://wa.bulumerak.com` instead of reading from the `ALLOWED_ORIGINS` environment variable.

## Solution
Updated the manual CORS middleware to:
1. Read allowed origins from `ALLOWED_ORIGINS` environment variable
2. Check if the request origin is in the allowed list
3. Set the appropriate `Access-Control-Allow-Origin` header dynamically

## Fixed Code
```javascript
// Manual CORS middleware to ensure headers are always set (for Cloudflare Tunnel compatibility)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['*'];
  
  // Check if origin is allowed
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  } else {
    // Fallback to wa.bulumerak.com for compatibility
    res.header('Access-Control-Allow-Origin', 'https://wa.bulumerak.com');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,device_id,x-api-key');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});
```

## Environment Variable
Ensure `ALLOWED_ORIGINS` includes all required domains:
```
ALLOWED_ORIGINS=http://localhost:8080,http://localhost:3000,https://wa.bulumerak.com,https://3004.bulumerak.com
```

## Testing
Use the following commands to restart all workers:
```bash
cd Server
.\restart-workers.bat
```

Or manually:
```bash
.\start-workers.bat
```

## Verification
Test CORS with:
```powershell
Invoke-WebRequest -Uri "http://localhost:3004/api/broadcasts" -Method GET -Headers @{"Origin"="https://3004.bulumerak.com"; "x-api-key"="test"}
```

This should now return a successful response with proper CORS headers. 