/**
 * AssetService
 * 
 * Service untuk mengelola asset di Supabase Storage dan database
 */
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import path from 'path';
import sharp from 'sharp';
import { Buffer } from 'buffer';

// Initialize Supabase client with service role key for admin access
// This bypasses RLS policies for server-side operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Storage bucket name
const STORAGE_BUCKET = 'whatsapp-assets';

class AssetService {
  constructor() {
    // Ensure bucket exists when service is initialized
    this.ensureStorageBucketExists();
  }

  /**
   * Ensure the storage bucket exists
   */
  async ensureStorageBucketExists() {
    try {
      // Check if bucket exists
      const { data: buckets } = await supabase.storage.listBuckets();
      const bucketExists = buckets.some(bucket => bucket.name === STORAGE_BUCKET);
      
      if (!bucketExists) {
        console.log(`Creating storage bucket: ${STORAGE_BUCKET}`);
        // Create the bucket with public access
        const { data, error } = await supabase.storage.createBucket(STORAGE_BUCKET, {
          public: true,
          allowedMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf', 'text/*'],
          fileSizeLimit: 50000000 // 50MB (reduced from 100MB to avoid size limit issues)
        });
        
        if (error) {
          console.error('Error creating storage bucket:', error);
          // If bucket creation fails, it might already exist with different config
          // Continue with existing bucket
          console.log(`Using existing storage bucket: ${STORAGE_BUCKET}`);
        } else {
          console.log(`Storage bucket ${STORAGE_BUCKET} created successfully`);
        }
        
        // Ensure tables exist regardless of bucket creation result
        await this.ensureTablesExist();
      } else {
        console.log(`Storage bucket ${STORAGE_BUCKET} already exists`);
        // Ensure tables exist
        await this.ensureTablesExist();
      }
    } catch (error) {
      console.error('Error checking/creating storage bucket:', error);
      // Continue with existing bucket if there's an error
      console.log(`Continuing with existing storage bucket: ${STORAGE_BUCKET}`);
      try {
        await this.ensureTablesExist();
      } catch (tableError) {
        console.error('Error ensuring tables exist:', tableError);
      }
    }
  }
  
  /**
   * Ensure the necessary database tables exist
   */
  async ensureTablesExist() {
    try {
      // Check if asset_library table exists
      const { error: libraryCheckError } = await supabase
        .from('asset_library')
        .select('count')
        .limit(1)
        .single();
      
      // If error, table might not exist
      if (libraryCheckError && libraryCheckError.code === 'PGRST116') {
        console.log('Creating asset_library table...');
        
        // Create asset_library table using SQL query
        const { error: createLibraryError } = await supabase.rpc('create_tables', {
          sql: `
            CREATE TABLE IF NOT EXISTS public.asset_library (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              user_id UUID NOT NULL,
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
              metadata JSONB DEFAULT '{}'::jsonb,
              usage_count INTEGER DEFAULT 1,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
              last_used_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            );
            
            CREATE INDEX IF NOT EXISTS idx_asset_library_user_id ON public.asset_library(user_id);
            CREATE INDEX IF NOT EXISTS idx_asset_library_content_hash ON public.asset_library(content_hash);
            CREATE INDEX IF NOT EXISTS idx_asset_library_asset_type ON public.asset_library(asset_type);
          `
        });
        
        if (createLibraryError) {
          console.error('Error creating asset_library table:', createLibraryError);
        } else {
          console.log('asset_library table created successfully');
        }
      }
      
      // Check if asset_usage table exists
      const { error: usageCheckError } = await supabase
        .from('asset_usage')
        .select('count')
        .limit(1)
        .single();
      
      // If error, table might not exist
      if (usageCheckError && usageCheckError.code === 'PGRST116') {
        console.log('Creating asset_usage table...');
        
        // Create asset_usage table using SQL query
        const { error: createUsageError } = await supabase.rpc('create_tables', {
          sql: `
            CREATE TABLE IF NOT EXISTS public.asset_usage (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              asset_id UUID NOT NULL,
              entity_type TEXT NOT NULL,
              entity_id TEXT NOT NULL,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            );
            
            CREATE INDEX IF NOT EXISTS idx_asset_usage_asset_id ON public.asset_usage(asset_id);
            CREATE INDEX IF NOT EXISTS idx_asset_usage_entity ON public.asset_usage(entity_type, entity_id);
            
            -- Add foreign key if asset_library table exists
            DO $$
            BEGIN
              IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'asset_library') THEN
                ALTER TABLE public.asset_usage 
                ADD CONSTRAINT fk_asset_usage_asset_id 
                FOREIGN KEY (asset_id) 
                REFERENCES public.asset_library(id) 
                ON DELETE CASCADE;
              END IF;
            END
            $$;
          `
        });
        
        if (createUsageError) {
          console.error('Error creating asset_usage table:', createUsageError);
        } else {
          console.log('asset_usage table created successfully');
        }
      }
      
      // Create function to increment asset usage count
      const { error: funcError } = await supabase.rpc('create_tables', {
        sql: `
          CREATE OR REPLACE FUNCTION increment_asset_usage(asset_id UUID)
          RETURNS void AS $$
          BEGIN
            UPDATE public.asset_library
            SET 
              usage_count = usage_count + 1,
              last_used_at = now()
            WHERE id = asset_id;
          END;
          $$ LANGUAGE plpgsql;
        `
      });
      
      if (funcError) {
        console.error('Error creating increment_asset_usage function:', funcError);
      }
      
    } catch (error) {
      console.error('Error ensuring tables exist:', error);
    }
  }

  /**
   * Upload asset to Supabase Storage and record in database
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} filename - Original filename
   * @param {string} mimeType - File MIME type
   * @param {string} userId - User ID
   * @param {Object} metadata - Additional metadata
   */
  async uploadAsset(fileBuffer, filename, mimeType, userId, metadata = {}) {
    try {
      // Generate a content hash to detect duplicates
      const contentHash = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex')
        .substring(0, 20);
      
      // Check if this file already exists for this user
      const { data: existingAsset } = await supabase
        .from('asset_library')
        .select('*')
        .eq('user_id', userId)
        .eq('content_hash', contentHash)
        .maybeSingle();
      
      if (existingAsset) {
        // Update usage count, last_used_at, and ensure bucket_name is set correctly
        const updates = {
          usage_count: existingAsset.usage_count + 1,
          last_used_at: new Date().toISOString()
        };
        if (!existingAsset.bucket_name || existingAsset.bucket_name !== STORAGE_BUCKET) {
          updates.bucket_name = STORAGE_BUCKET;
        }

        await supabase
          .from('asset_library')
          .update(updates)
          .eq('id', existingAsset.id);

        // Reflect updated bucket_name in returned object
        return { ...existingAsset, ...updates };
      }

      // Determine asset type from mime type
      const assetType = this.getAssetTypeFromMimeType(mimeType);
      if (!assetType) {
        throw new Error('Unsupported file type');
      }

      // Prepare file metadata
      const ext = path.extname(filename) || this.getExtensionFromMimeType(mimeType);
      const datePath = new Date().toISOString().slice(0, 7); // YYYY-MM
      const storagePath = `${userId}/${assetType}s/${datePath}/${contentHash}${ext}`;
      
      // Additional processing based on asset type
      let width, height, duration, thumbnailPath;
      
      if (assetType === 'image') {
        // For images, get dimensions and create thumbnail if needed
        const imageInfo = await sharp(fileBuffer).metadata();
        width = imageInfo.width;
        height = imageInfo.height;
        
        // Generate thumbnail for large images
        if (width > 800 || height > 800) {
          const thumbnailBuffer = await this.createImageThumbnail(fileBuffer);
          const thumbnailStoragePath = `${userId}/${assetType}s/${datePath}/thumbnails/${contentHash}_thumb${ext}`;
          
          // Upload thumbnail
          const { error: thumbError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(thumbnailStoragePath, thumbnailBuffer, {
              contentType: mimeType,
              upsert: true
            });
          
          if (thumbError) {
            console.error('Thumbnail upload error:', thumbError);
          } else {
            thumbnailPath = thumbnailStoragePath;
          }
        }
      }
      
      // Upload the file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: mimeType,
          upsert: true
        });
      
      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }
      
      // Create asset record in database
      const assetData = {
        bucket_name: STORAGE_BUCKET,
        user_id: userId,
        filename: path.basename(storagePath),
        original_filename: filename,
        content_hash: contentHash,
        storage_path: storagePath,
        asset_type: assetType,
        mime_type: mimeType,
        size_bytes: fileBuffer.length,
        width,
        height,
        duration,
        thumbnail_path: thumbnailPath,
        tags: metadata.tags || [],
        metadata: metadata.extraData || {},
        usage_count: 1,
        last_used_at: new Date().toISOString()
      };
      
      console.log('Creating asset record with data:', JSON.stringify(assetData));
      
      const { data: asset, error: dbError } = await supabase
        .from('asset_library')
        .insert(assetData)
        .select()
        .single();
      
      if (dbError) {
        // Log detailed error information
        console.error('Database insert error:', dbError);
        
        // Attempt to clean up the uploaded file
        await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([storagePath]);
          
        if (thumbnailPath) {
          await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([thumbnailPath]);
        }
        
        throw new Error(`Database record creation failed: ${dbError.message}`);
      }
      
      // Generate URLs for asset and thumbnail
      const { data: { publicUrl } } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);
      
      let thumbnailUrl = null;
      if (thumbnailPath) {
        const { data: { publicUrl: thumbUrl } } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(thumbnailPath);
        thumbnailUrl = thumbUrl;
      }
      
      return {
        ...asset,
        url: publicUrl,
        thumbnailUrl
      };
    } catch (error) {
      console.error('Asset upload failed:', error);
      throw error;
    }
  }
  
  /**
   * Find assets based on filters
   * @param {string} userId - User ID
   * @param {Object} filters - Filter parameters
   * @returns {Object} - Asset list and total count
   */
  async findAssets(userId, filters = {}) {
    try {
      const {
        type,
        search,
        tags,
        limit = 20,
        offset = 0,
        sort = 'created_at:desc'
      } = filters;
      
      let query = supabase
        .from('asset_library')
        .select('*, asset_usage(id)', { count: 'exact' })
        .eq('user_id', userId);
      
      // Apply filters
      if (type) {
        query = query.eq('asset_type', type);
      }
      
      if (search) {
        query = query.or(`original_filename.ilike.%${search}%,tags.cs.{${search}}`);
      }
      
      if (tags && tags.length > 0) {
        query = query.contains('tags', tags);
      }
      
      // Apply sorting
      const [sortField, sortDirection] = sort.split(':');
      query = query.order(sortField, { ascending: sortDirection === 'asc' });
      
      // Apply pagination
      query = query.range(offset, offset + limit - 1);
      
      const { data: assets, count, error } = await query;
      
      if (error) {
        throw new Error(`Failed to fetch assets: ${error.message}`);
      }
      
      // Get signed URLs for assets
      const assetsWithUrls = await Promise.all(assets.map(async (asset) => {
        const { data: { publicUrl } } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(asset.storage_path);
        
        let thumbnailUrl = null;
        if (asset.thumbnail_path) {
          const { data: { publicUrl: thumbUrl } } = supabase.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(asset.thumbnail_path);
          thumbnailUrl = thumbUrl;
        }
        
        return {
          ...asset,
          url: publicUrl,
          thumbnailUrl
        };
      }));
      
      return {
        assets: assetsWithUrls,
        total: count
      };
    } catch (error) {
      console.error('Find assets failed:', error);
      throw error;
    }
  }
  
  /**
   * Get asset by ID
   * @param {string} assetId - Asset ID
   * @param {string} userId - User ID
   * @returns {Object} - Asset details
   */
  async getAssetById(assetId, userId) {
    try {
      const { data: asset, error } = await supabase
        .from('asset_library')
        .select('*')
        .eq('id', assetId)
        .eq('user_id', userId)
        .single();
      
      if (error) {
        throw new Error(`Asset not found: ${error.message}`);
      }
      
      // Get public URL for asset
      const { data: { publicUrl } } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(asset.storage_path);
      
      let thumbnailUrl = null;
      if (asset.thumbnail_path) {
        const { data: { publicUrl: thumbUrl } } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(asset.thumbnail_path);
        thumbnailUrl = thumbUrl;
      }
      
      // Get usage info
      const { data: usageData } = await supabase
        .from('asset_usage')
        .select('*')
        .eq('asset_id', assetId);
      
      return {
        ...asset,
        url: publicUrl,
        thumbnailUrl,
        usage: usageData || []
      };
    } catch (error) {
      console.error('Get asset failed:', error);
      throw error;
    }
  }
  
  /**
   * Delete asset
   * @param {string} assetId - Asset ID
   * @param {string} userId - User ID
   * @returns {boolean} - Success status
   */
  async deleteAsset(assetId, userId) {
    try {
      // Get asset details first
      const { data: asset, error: fetchError } = await supabase
        .from('asset_library')
        .select('*')
        .eq('id', assetId)
        .eq('user_id', userId)
        .single();
      
      if (fetchError) {
        throw new Error(`Asset not found: ${fetchError.message}`);
      }
      
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([asset.storage_path]);
      
      if (storageError) {
        console.error('Storage delete failed:', storageError);
        // Continue with DB deletion even if storage deletion fails
      }
      
      // Delete thumbnail if exists
      if (asset.thumbnail_path) {
        await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([asset.thumbnail_path]);
      }
      
      // Delete from database
      const { error: dbError } = await supabase
        .from('asset_library')
        .delete()
        .eq('id', assetId)
        .eq('user_id', userId);
      
      if (dbError) {
        throw new Error(`Database delete failed: ${dbError.message}`);
      }
      
      return true;
    } catch (error) {
      console.error('Delete asset failed:', error);
      throw error;
    }
  }
  
  /**
   * Update asset metadata
   * @param {string} assetId - Asset ID
   * @param {string} userId - User ID
   * @param {Object} metadata - Metadata to update
   * @returns {Object} - Updated asset
   */
  async updateAssetMetadata(assetId, userId, metadata) {
    try {
      const { data: asset, error } = await supabase
        .from('asset_library')
        .update({
          tags: metadata.tags || [],
          metadata: metadata.extraData || {},
          last_used_at: new Date().toISOString()
        })
        .eq('id', assetId)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) {
        throw new Error(`Update failed: ${error.message}`);
      }
      
      // Get public URL for asset
      const { data: { publicUrl } } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(asset.storage_path);
      
      let thumbnailUrl = null;
      if (asset.thumbnail_path) {
        const { data: { publicUrl: thumbUrl } } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(asset.thumbnail_path);
        thumbnailUrl = thumbUrl;
      }
      
      return {
        ...asset,
        url: publicUrl,
        thumbnailUrl
      };
    } catch (error) {
      console.error('Update metadata failed:', error);
      throw error;
    }
  }
  
  /**
   * Record asset usage in a message
   * @param {string} assetId - Asset ID
   * @param {string} entityType - Entity type (drip_message, scheduled_message, broadcast)
   * @param {string} entityId - Entity ID
   * @returns {Object} - Usage record
   */
  async recordAssetUsage(assetId, entityType, entityId) {
    try {
      // Insert usage record
      const { data: usage, error } = await supabase
        .from('asset_usage')
        .insert({
          asset_id: assetId,
          entity_type: entityType,
          entity_id: entityId
        })
        .select()
        .single();
      
      if (error) {
        throw new Error(`Failed to record usage: ${error.message}`);
      }
      
      // Update asset usage count
      await supabase.rpc('increment_asset_usage', { asset_id: assetId });
      
      return usage;
    } catch (error) {
      console.error('Record usage failed:', error);
      throw error;
    }
  }
  
  /**
   * Get asset usage statistics
   * @param {string} userId - User ID
   * @returns {Object} - Usage statistics
   */
  async getAssetStatistics(userId) {
    try {
      // Get total storage used
      const { data: storageData, error: storageError } = await supabase
        .from('asset_library')
        .select('size_bytes')
        .eq('user_id', userId);
      
      if (storageError) {
        throw new Error(`Failed to get storage stats: ${storageError.message}`);
      }
      
      const totalStorage = storageData.reduce((sum, item) => sum + item.size_bytes, 0);
      
      // Get count by type
      const { data: typeCounts, error: typeError } = await supabase
        .from('asset_library')
        .select('asset_type, count')
        .eq('user_id', userId)
        .group('asset_type');
      
      if (typeError) {
        throw new Error(`Failed to get type stats: ${typeError.message}`);
      }
      
      // Get most used assets
      const { data: mostUsed, error: usageError } = await supabase
        .from('asset_library')
        .select('*')
        .eq('user_id', userId)
        .order('usage_count', { ascending: false })
        .limit(5);
      
      if (usageError) {
        throw new Error(`Failed to get usage stats: ${usageError.message}`);
      }
      
      return {
        totalStorage,
        totalAssets: storageData.length,
        byType: typeCounts,
        mostUsed
      };
    } catch (error) {
      console.error('Get statistics failed:', error);
      throw error;
    }
  }
  
  /**
   * Create a thumbnail for an image
   * @param {Buffer} buffer - Image buffer
   * @returns {Buffer} - Thumbnail buffer
   */
  async createImageThumbnail(buffer) {
    try {
      return await sharp(buffer)
        .resize(300, 300, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .toBuffer();
    } catch (error) {
      console.error('Thumbnail creation failed:', error);
      return buffer; // Return original if thumbnail creation fails
    }
  }
  
  /**
   * Get asset type from MIME type
   * @param {string} mimeType - MIME type
   * @returns {string|null} - Asset type
   */
  getAssetTypeFromMimeType(mimeType) {
    if (!mimeType) return null;
    
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    
    const documentTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv'
    ];
    
    if (documentTypes.includes(mimeType)) return 'document';
    
    return null;
  }
  
  /**
   * Get file extension from MIME type
   * @param {string} mimeType - MIME type
   * @returns {string} - File extension with dot
   */
  getExtensionFromMimeType(mimeType) {
    const mimeToExt = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/ogg': '.ogg',
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'text/plain': '.txt',
      'text/csv': '.csv'
    };
    
    return mimeToExt[mimeType] || '.bin';
  }
}

export default new AssetService(); 