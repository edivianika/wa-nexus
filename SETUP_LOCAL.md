# 🚀 Setup Local Development

Panduan cepat untuk menjalankan WhatsApp AI di local development.

## ✅ Prerequisites

- Node.js (v16+)
- Redis Server
- npm atau yarn

## 🛠️ Quick Setup

### 1. Install Redis

**macOS:**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt install redis-server
sudo systemctl start redis-server
```

### 2. Setup Environment Variables

```bash
# Jalankan script setup otomatis
./setup-env.sh
```

Atau manual:
```bash
# Copy template ke .env
cp env-template.txt Server/.env
cp Client-UI/env-template.txt Client-UI/.env
cp File-Api/env-template.txt File-Api/.env
```

### 3. Install Dependencies

```bash
# Server
cd Server && npm install

# Client-UI
cd ../Client-UI && npm install

# File-Api (opsional)
cd ../File-Api && npm install
```

### 4. Run Application

```bash
# Terminal 1 - Server
cd Server
npm run dev

# Terminal 2 - Client-UI
cd Client-UI
npm run dev
```

### 5. Access Application

- 🌐 **Frontend**: http://localhost:5173
- 🔧 **Backend**: http://localhost:3000
- 📚 **API Docs**: http://localhost:3000/api-documentation.html

## 🔧 Troubleshooting

### Redis Connection
```bash
redis-cli ping
# Should return: PONG
```

### Port Already in Use
```bash
lsof -i :3000
kill -9 <PID>
```

### CORS Issues
- Pastikan `ALLOWED_ORIGINS` di Server/.env mencakup `http://localhost:5173`
- Restart server setelah mengubah konfigurasi

## 📚 More Info

- 📖 [ENV_SETUP_GUIDE.md](ENV_SETUP_GUIDE.md) - Panduan lengkap environment variables
- 📋 [README.md](README.md) - Dokumentasi utama proyek

---

**Ready to code! 🎉**
