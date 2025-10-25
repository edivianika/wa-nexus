#!/bin/bash

# Script untuk setup environment variables
# WhatsApp AI - Local Development Setup

echo "🚀 WhatsApp AI - Environment Setup"
echo "=================================="

# Fungsi untuk membuat file .env
create_env_file() {
    local dir=$1
    local template=$2
    
    if [ -f "$dir/.env" ]; then
        echo "⚠️  File .env sudah ada di $dir"
        read -p "Apakah Anda ingin menggantinya? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "⏭️  Melewati $dir"
            return
        fi
    fi
    
    if [ -f "$template" ]; then
        cp "$template" "$dir/.env"
        echo "✅ File .env berhasil dibuat di $dir"
    else
        echo "❌ Template tidak ditemukan: $template"
    fi
}

# Buat direktori jika belum ada
mkdir -p Server
mkdir -p Client-UI
mkdir -p File-Api

# Setup Server .env
echo "📁 Setting up Server environment..."
create_env_file "Server" "env-template.txt"

# Setup Client-UI .env
echo "📁 Setting up Client-UI environment..."
create_env_file "Client-UI" "Client-UI/env-template.txt"

# Setup File-Api .env
echo "📁 Setting up File-Api environment..."
create_env_file "File-Api" "File-Api/env-template.txt"

echo ""
echo "🎉 Setup environment variables selesai!"
echo ""
echo "📋 Langkah selanjutnya:"
echo "1. Install dependencies:"
echo "   cd Server && npm install"
echo "   cd ../Client-UI && npm install"
echo "   cd ../File-Api && npm install"
echo ""
echo "2. Pastikan Redis server berjalan:"
echo "   redis-cli ping"
echo ""
echo "3. Jalankan aplikasi:"
echo "   # Terminal 1: Server"
echo "   cd Server && npm run dev"
echo ""
echo "   # Terminal 2: Client-UI"
echo "   cd Client-UI && npm run dev"
echo ""
echo "4. Akses aplikasi:"
echo "   Frontend: http://localhost:5173"
echo "   Backend: http://localhost:3000"
echo "   API Docs: http://localhost:3000/api-documentation.html"
echo ""
echo "📖 Untuk informasi lebih lengkap, lihat ENV_SETUP_GUIDE.md"
