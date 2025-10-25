# Media Management Implementation

## Overview

This document describes the implementation of the comprehensive media management system for the WhatsApp messaging application. The system provides a centralized way to store, organize, and reuse media assets across different message types including broadcasts, drip campaigns, and scheduled messages.

## Architecture

The media management system consists of the following components:

### Backend Components

1. **Storage Infrastructure**
   - Supabase storage bucket named "whatsapp-assets"
   - Files organized by user ID and media type
   - Security policies to restrict access to owner only

2. **Database Schema**
   - `asset_library` table to store asset metadata
   - `asset_usage` table to track where assets are used
   - Foreign key relationships from messaging tables to assets

3. **Asset Service**
   - Core functionality for uploading, retrieving, and managing assets
   - Intelligent deduplication via content hashing
   - Automatic thumbnail generation for images
   - Usage tracking and statistics

4. **API Routes**
   - RESTful endpoints for all asset operations
   - Integration with authentication middleware

### Frontend Components

1. **Asset Service Client**
   - TypeScript service for communicating with API endpoints
   - Handles file uploads with progress tracking
   - Manages asset filtering and pagination

2. **UI Components**
   - `AssetGrid` - Displays assets in a responsive grid layout
   - `AssetUploadModal` - Modal for uploading new assets
   - `AssetPicker` - Component for selecting assets in message forms
   - `AssetManagerPage` - Main interface for asset management

3. **Integration with Messaging**
   - Broadcast messages
   - Drip campaigns
   - Scheduled messages
   - Individual messaging

## Database Schema

### Asset Library Table

```sql
CREATE TABLE asset_library (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  duration INTEGER,
  thumbnail_path TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, content_hash)
);

CREATE INDEX idx_asset_library_user_id ON asset_library(user_id);
CREATE INDEX idx_asset_library_content_hash ON asset_library(content_hash);
CREATE INDEX idx_asset_library_tags ON asset_library USING GIN(tags);
```

### Asset Usage Table

```sql
CREATE TABLE asset_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID NOT NULL REFERENCES asset_library(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_asset_usage_asset_id ON asset_usage(asset_id);
CREATE INDEX idx_asset_usage_entity ON asset_usage(entity_type, entity_id);
```

### Database Functions

```sql
-- Function to increment asset usage count
CREATE OR REPLACE FUNCTION increment_asset_usage(asset_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE asset_library
  SET 
    usage_count = usage_count + 1,
    last_used_at = NOW()
  WHERE id = asset_id;
END;
$$ LANGUAGE plpgsql;
```

## Message Component Integration

The media management system is integrated into the following message components:

### Broadcast Messages

Broadcast messages now use the `AssetPicker` component to select media from the asset library. When a broadcast is sent, the selected assets are recorded in the `asset_usage` table with the entity type "broadcast".

### Drip Campaign Messages

Drip campaign messages include the ability to select media from the asset library. The database schema has been updated to include `asset_id` in the `drip_messages` table. When a message is sent as part of a drip campaign, the usage is recorded.

### Scheduled Messages

Scheduled messages also use the `AssetPicker` component and track asset usage when messages are scheduled and sent.

## Future Improvements

1. **Asset Analytics**
   - Detailed usage statistics and visualization
   - Most used assets report

2. **Advanced Media Processing**
   - Video thumbnail generation
   - Audio waveform generation
   - Document preview generation

3. **AI Integration**
   - Automatic tagging of images
   - Content moderation
   - Smart search capabilities

4. **Advanced Organization**
   - Asset folders/collections
   - Bulk operations on assets
   - Advanced filtering and sorting

## Migration Notes

To add asset tracking to existing message tables:

```sql
-- Add asset_id column to drip_messages table
ALTER TABLE drip_messages ADD COLUMN IF NOT EXISTS asset_id UUID;
ALTER TABLE drip_messages ADD CONSTRAINT fk_drip_message_asset 
FOREIGN KEY (asset_id) REFERENCES asset_library(id) ON DELETE SET NULL;

-- Add asset_id column to scheduled_messages table
ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS asset_id UUID;
ALTER TABLE scheduled_messages ADD CONSTRAINT fk_scheduled_message_asset 
FOREIGN KEY (asset_id) REFERENCES asset_library(id) ON DELETE SET NULL;
```

# Panduan Implementasi Sistem Pengelolaan Media WhatsApp App

## Daftar Isi

1. [Ringkasan Proyek](#ringkasan-proyek)
2. [Infrastruktur Supabase](#infrastruktur-supabase)
3. [Struktur Database](#struktur-database)
4. [Rancangan API](#rancangan-api)
5. [Pengembangan Backend](#pengembangan-backend)
6. [Pengembangan Frontend](#pengembangan-frontend)
7. [Integrasi dengan Sistem Messaging](#integrasi-dengan-sistem-messaging)
8. [Testing & Deployment](#testing--deployment)
9. [Timeline Implementasi](#timeline-implementasi)
10. [Pertimbangan Keamanan](#pertimbangan-keamanan)

## Ringkasan Proyek

Sistem pengelolaan media ini akan memungkinkan user untuk mengunggah, mengelola, dan menggunakan media di berbagai fitur messaging (drip campaign, scheduled message, broadcast). Media akan disimpan di Supabase Storage dengan organisasi berbasis user_id.

**Nama Bucket**: `whatsapp-assets`

## Infrastruktur Supabase

### Setup Bucket Storage

1. Buat bucket baru di Supabase Storage dengan nama `whatsapp-assets`
2. Konfigurasi RLS (Row Level Security) untuk membatasi akses per user

```sql
-- Policy untuk membaca file (hanya pemilik file)
CREATE POLICY "User can view own media" 
ON storage.objects FOR SELECT 
USING (auth.uid()::text = (storage.foldername(name))[1]);

-- Policy untuk mengunggah file (hanya ke folder sendiri)
CREATE POLICY "User can upload to own folder" 
ON storage.objects FOR INSERT 
WITH CHECK (auth.uid()::text = (storage.foldername(name))[1]);

-- Policy untuk menghapus file (hanya pemilik file)
CREATE POLICY "User can delete own media" 
ON storage.objects FOR DELETE 
USING (auth.uid()::text = (storage.foldername(name))[1]);
```

### Struktur Direktori

```
whatsapp-assets/
├── {user_id}/                   # Folder utama per user
│   ├── images/                  # Subfolder untuk gambar
│   │   ├── {yyyy-mm}/           # Organisasi berdasarkan bulan upload
│   │   │   ├── {content_hash}.jpg
│   │   ├── videos/                  # Subfolder untuk video
│   │   ├── documents/               # Subfolder untuk dokumen
│   │   ├── audio/                   # Subfolder untuk audio
│   ├── system/                      # Folder untuk aset sistem
```

## Struktur Database

### Tabel `asset_library`

```sql
CREATE TABLE asset_library (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  asset_type TEXT NOT NULL, -- 'image', 'video', 'document', 'audio'
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER, -- untuk gambar/video
  height INTEGER, -- untuk gambar/video
  duration INTEGER, -- untuk audio/video dalam detik
  thumbnail_path TEXT, -- path thumbnail untuk video/dokumen
  tags TEXT[], -- array tag untuk pencarian dan kategorisasi
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  usage_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb, -- metadata tambahan
  
  -- Memastikan content_hash unik per user untuk deduplication
  UNIQUE(user_id, content_hash)
);

-- Indeks untuk pencarian
CREATE INDEX idx_asset_library_user_id ON asset_library(user_id);
CREATE INDEX idx_asset_library_asset_type ON asset_library(asset_type);
CREATE INDEX idx_asset_library_tags ON asset_library USING GIN(tags);
CREATE INDEX idx_asset_library_last_used ON asset_library(last_used_at);
```

### Tabel `asset_usage`

```sql
CREATE TABLE asset_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID NOT NULL REFERENCES asset_library(id),
  entity_type TEXT NOT NULL, -- 'drip_message', 'scheduled_message', 'broadcast'
  entity_id UUID NOT NULL, -- ID dari pesan yang menggunakan media
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indeks untuk relasi penggunaan
CREATE INDEX idx_asset_usage_asset_id ON asset_usage(asset_id);
CREATE INDEX idx_asset_usage_entity ON asset_usage(entity_type, entity_id);
```

## Rancangan API

### Endpoint Media Management

| Endpoint | Method | Deskripsi |
|----------|--------|-----------|
| `/api/assets/upload` | POST | Upload asset baru |
| `/api/assets` | GET | Dapatkan daftar asset user dengan filter |
| `/api/assets/:id` | GET | Dapatkan detail asset |
| `/api/assets/:id` | DELETE | Hapus asset |
| `/api/assets/:id/metadata` | PUT | Update metadata asset (tags, dll) |
| `/api/assets/:id/usage` | GET | Dapatkan informasi penggunaan asset |
| `/api/assets/stats` | GET | Dapatkan statistik penggunaan asset |
| `/api/assets/batch` | POST | Operasi batch pada multiple asset |

### Parameter & Request Body

#### Upload Asset
```javascript
// POST /api/assets/upload
// Content-Type: multipart/form-data

{
  file: File,                // Binary file data
  assetType: String,         // 'image', 'video', 'document', 'audio'
  customFilename: String,    // Optional
  description: String,       // Optional
  tags: Array<String>,       // Optional
}

// Response
{
  success: Boolean,
  asset: {
    id: String,
    filename: String,
    url: String,
    thumbnailUrl: String,    // if applicable
    assetType: String,
    mimeType: String,
    size: Number,
    dimensions: {            // if applicable
      width: Number,
      height: Number
    },
    duration: Number,        // if applicable
    tags: Array<String>,
    createdAt: String,
    usageCount: Number
  }
}
```

#### Get Asset List
```javascript
// GET /api/assets?type=image&search=keyword&tags=tag1,tag2&limit=20&offset=0&sort=created_at:desc

// Response
{
  success: Boolean,
  total: Number,
  assets: [
    // Array of asset objects
  ]
}
```

## Pengembangan Backend

### 1. Service Layer

Buat file `Server/src/services/assetService.js`:

```javascript
/**
 * AssetService
 * 
 * Service untuk mengelola asset di Supabase Storage dan database
 */

class AssetService {
  // Metode upload dengan validasi dan deduplication
  async uploadAsset(file, userId, metadata) { /* ... */ }
  
  // Metode untuk mencari asset berdasarkan parameter
  async findAssets(userId, filters) { /* ... */ }
  
  // Metode detail asset
  async getAssetById(assetId, userId) { /* ... */ }
  
  // Metode untuk menghapus asset
  async deleteAsset(assetId, userId) { /* ... */ }
  
  // Metode untuk update metadata
  async updateAssetMetadata(assetId, userId, metadata) { /* ... */ }
  
  // Metode untuk mencatat penggunaan asset
  async recordAssetUsage(assetId, entityType, entityId) { /* ... */ }
  
  // Metode untuk mengoptimasi dan membuat thumbnail
  async processAsset(file, assetType) { /* ... */ }
  
  // Metode untuk mendapatkan statistik penggunaan
  async getAssetStatistics(userId) { /* ... */ }
}

module.exports = new AssetService();
```

### 2. Route Handlers

Buat file `Server/src/api/routes/assetRoutes.js`:

```javascript
/**
 * Asset API Routes
 * 
 * Endpoint untuk mengelola asset media
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const assetService = require('../../services/assetService');
const { authenticateUser } = require('../../middleware/auth');

// Middleware untuk ekstrak user dari token
router.use(authenticateUser);

// Konfigurasi multer untuk handle file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

// Route untuk upload asset
router.post('/upload', upload.single('file'), async (req, res) => {
  // Implementasi handler
});

// Route untuk get asset list
router.get('/', async (req, res) => {
  // Implementasi handler
});

// Route untuk get asset detail
router.get('/:id', async (req, res) => {
  // Implementasi handler
});

// Route untuk delete asset
router.delete('/:id', async (req, res) => {
  // Implementasi handler
});

// Route untuk update metadata
router.put('/:id/metadata', async (req, res) => {
  // Implementasi handler
});

// Route untuk get asset usage
router.get('/:id/usage', async (req, res) => {
  // Implementasi handler
});

// Route untuk batch operations
router.post('/batch', async (req, res) => {
  // Implementasi handler
});

module.exports = router;
```

### 3. Integrasi ke Server.js

Update file `Server/src/server.js` untuk menambahkan routes:

```javascript
// Existing imports
const assetRoutes = require('./api/routes/assetRoutes');

// Existing middleware setup

// Add routes
app.use('/api/assets', assetRoutes);

// Rest of the server.js code
```

## Pengembangan Frontend

### 1. Services

Buat file `Client-UI/src/services/assetService.ts`:

```typescript
/**
 * Asset Service Client
 * 
 * Fungsi untuk berkomunikasi dengan API asset
 */

import { API_URL } from '../config';

export interface Asset {
  id: string;
  filename: string;
  url: string;
  thumbnailUrl?: string;
  assetType: 'image' | 'video' | 'document' | 'audio';
  mimeType: string;
  size: number;
  dimensions?: {
    width: number;
    height: number;
  };
  duration?: number;
  tags: string[];
  createdAt: string;
  usageCount: number;
}

export interface AssetFilter {
  type?: string;
  search?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  sort?: string;
}

class AssetService {
  // Upload asset dengan progress tracking
  async uploadAsset(file: File, metadata: any, onProgress?: (progress: number) => void): Promise<Asset> {
    // Implementasi
  }
  
  // Get asset list dengan filter
  async getAssets(filters: AssetFilter): Promise<{ total: number, assets: Asset[] }> {
    // Implementasi
  }
  
  // Get asset detail
  async getAssetById(id: string): Promise<Asset> {
    // Implementasi
  }
  
  // Delete asset
  async deleteAsset(id: string): Promise<boolean> {
    // Implementasi
  }
  
  // Update metadata
  async updateAssetMetadata(id: string, metadata: any): Promise<Asset> {
    // Implementasi
  }
  
  // Get asset usage info
  async getAssetUsage(id: string): Promise<any> {
    // Implementasi
  }
}

export default new AssetService();
```

### 2. Komponen UI

#### Asset Manager Page

Buat file `Client-UI/src/pages/dashboard/AssetManagerPage.tsx`:

```typescript
/**
 * Asset Manager Page
 * 
 * Halaman utama untuk mengelola asset media
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssetGrid } from '@/components/asset/AssetGrid';
import { AssetUploadModal } from '@/components/asset/AssetUploadModal';
import { AssetFilterBar } from '@/components/asset/AssetFilterBar';
import assetService, { Asset, AssetFilter } from '@/services/assetService';
import { toast } from 'sonner';

export default function AssetManagerPage() {
  // Implementasi halaman utama asset manager
}
```

#### Asset Picker Component

Buat file `Client-UI/src/components/asset/AssetPicker.tsx`:

```typescript
/**
 * Asset Picker Component
 * 
 * Komponen untuk memilih asset dari library, digunakan dalam form pesan
 */

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssetGrid } from './AssetGrid';
import { AssetUploadForm } from './AssetUploadForm';
import assetService, { Asset } from '@/services/assetService';

interface AssetPickerProps {
  assetType?: string;
  onAssetSelect: (asset: Asset) => void;
  buttonLabel?: string;
}

export function AssetPicker({ assetType = "all", onAssetSelect, buttonLabel = "Select Media" }: AssetPickerProps) {
  // Implementasi picker component
}
```

## Integrasi dengan Sistem Messaging

### 1. Update Service Messaging

Modifikasi file-file service messaging untuk menggunakan asset:

- `Server/src/services/dripService.js`
- `Server/src/services/scheduledService.js`
- `Server/src/services/broadcastService.js`

Tambahkan fungsi untuk menghubungkan asset dengan pesan.

### 2. Update Form Pesan

Modifikasi komponen form pesan untuk menggunakan AssetPicker:

- `Client-UI/src/pages/dashboard/DripCampaignCreatePage.tsx`
- `Client-UI/src/pages/dashboard/DripCampaignEditPage.tsx`
- Halaman scheduled message dan broadcast

### 3. Update Message Display

Modifikasi komponen yang menampilkan pesan untuk menampilkan asset dengan benar.

## Testing & Deployment

### 1. Unit Testing

```
- Test upload asset
- Test deduplication
- Test listing dengan filter
- Test integrasi dengan messaging
```

### 2. Integration Testing

```
- Test flow end-to-end upload dan penggunaan di pesan
- Test performance dengan banyak asset
```

### 3. Deployment Checklist

```
- Update Supabase project dengan policies baru
- Migrasi database untuk tabel asset
- Deploy backend dengan endpoint baru
- Deploy frontend dengan komponen baru
```

## Timeline Implementasi

| Fase | Durasi | Aktivitas Utama |
|------|--------|-----------------|
| 1. Persiapan | 1-2 minggu | Setup Supabase, migrasi database |
| 2. Backend Development | 2-3 minggu | Implementasi service dan API |
| 3. Frontend Core | 2-3 minggu | Implementasi halaman & komponen utama |
| 4. Asset Picker | 1-2 minggu | Komponen picker & integrasi dengan form |
| 5. Messaging Integration | 2 minggu | Update service messaging |
| 6. Testing & Refinement | 2 minggu | Testing, fixing bugs, optimisasi |
| 7. Deploy & Monitor | 1 minggu | Deployment dan monitoring |

**Total:** 11-15 minggu

## Pertimbangan Keamanan

### Validasi File

Implementasikan validasi di server:

```javascript
// Contoh validasi file
function validateFile(file, assetType) {
  const allowedMimeTypes = {
    image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    video: ['video/mp4', 'video/webm', 'video/quicktime'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
    document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  };
  
  if (!allowedMimeTypes[assetType]?.includes(file.mimetype)) {
    throw new Error(`Invalid file type. Allowed types for ${assetType}: ${allowedMimeTypes[assetType].join(', ')}`);
  }
  
  // Add more validations as needed
}
```

### Mitigasi Risiko Storage

1. Implementasi storage quotas per user
2. Rate limiting untuk upload
3. Scan virus/malware (opsional)
4. Expiring URLs untuk asset download

---

Dokumen ini memberikan panduan komprehensif untuk implementasi sistem pengelolaan media. Implementasi bisa disesuaikan dengan kebutuhan spesifik dan resource yang tersedia.

**Catatan:** Bucket yang digunakan adalah `whatsapp-assets` untuk menghindari konflik dengan bucket `media` yang sudah ada. 