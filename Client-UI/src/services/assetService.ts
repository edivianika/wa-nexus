/**
 * Asset Service Client
 * 
 * Fungsi untuk berkomunikasi dengan API asset
 */

// Gunakan URL API yang sama dengan komponen lain
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

// Import supabase client for fallback authentication
import { supabase } from "@/integrations/supabase/client";

export interface Asset {
  id: string;
  filename: string;
  original_filename: string;
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
  metadata?: {
    description?: string;
    [key: string]: any;
  };
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
  /**
   * Get current user ID with fallback mechanisms
   * @returns User ID
   */
  async getUserId(): Promise<string> {
    // First try from localStorage
    let userId = localStorage.getItem('userId');
    
    // If not found, try to get from Supabase session
    if (!userId) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          userId = session.user.id;
          // Store it for future use
          localStorage.setItem('userId', userId);
          console.log('User ID retrieved from session and stored in localStorage:', userId);
        }
      } catch (error) {
        console.error('Error getting session:', error);
      }
    }
    
    // If still not found, try one more fallback - use a temporary ID for demo purposes
    if (!userId) {
      // This is a temporary fallback for demo only - should be removed in production
      console.warn('Creating temporary user ID as fallback - FOR DEMO ONLY');
      userId = 'demo-user-' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('userId', userId);
    }
    
    if (!userId) {
      throw new Error('User ID not found. Please log in again.');
    }
    
    return userId;
  }

  /**
   * Upload asset with progress tracking
   * @param file - File to upload
   * @param metadata - Additional metadata
   * @param onProgress - Progress callback
   * @returns - Uploaded asset
   */
  async uploadAsset(
    file: File,
    metadata: { description?: string; tags?: string[] } = {},
    onProgress?: (progress: number) => void
  ): Promise<Asset> {
    const formData = new FormData();
    formData.append('file', file);

    if (metadata.description) {
      formData.append('description', metadata.description);
    }

    if (metadata.tags && metadata.tags.length > 0) {
      formData.append('tags', JSON.stringify(metadata.tags));
    }

    // Get userId using the new method
    const userId = await this.getUserId();

    try {
      const response = await fetch(`${API_URL}/assets/upload`, {
        method: 'POST',
        headers: {
          'x-user-id': userId
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      return data.asset;
    } catch (error) {
      console.error('Asset upload failed:', error);
      throw error;
    }
  }

  /**
   * Get assets list with filtering
   * @param filters - Filter parameters
   * @returns - List of assets
   */
  async getAssets(filters: AssetFilter = {}): Promise<{ total: number; assets: Asset[] }> {
    // Get userId using the new method
    const userId = await this.getUserId();

    // Build query string
    const queryParams = new URLSearchParams();

    if (filters.type) queryParams.append('type', filters.type);
    if (filters.search) queryParams.append('search', filters.search);
    if (filters.tags && filters.tags.length > 0) queryParams.append('tags', filters.tags.join(','));
    if (filters.limit) queryParams.append('limit', filters.limit.toString());
    if (filters.offset) queryParams.append('offset', filters.offset.toString());
    if (filters.sort) queryParams.append('sort', filters.sort);

    try {
      const response = await fetch(`${API_URL}/assets?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch assets');
      }

      const data = await response.json();
      
      // Validate and sanitize the response data
      if (!data || !data.assets || !Array.isArray(data.assets)) {
        console.error('Invalid assets data received:', data);
        return { total: 0, assets: [] };
      }
      
      // Process and validate each asset
      const validatedAssets = data.assets
        .filter(asset => asset && typeof asset === 'object' && asset.id)
        .map(asset => this.validateAssetData(asset));
      
      return {
        total: data.total || validatedAssets.length,
        assets: validatedAssets
      };
    } catch (error) {
      console.error('Get assets failed:', error);
      throw error;
    }
  }
  
  /**
   * Validate and sanitize asset data
   * @param asset - Raw asset data from API
   * @returns - Validated asset data
   */
  private validateAssetData(asset: any): Asset {
    // Create a base asset with default values
    const validatedAsset: Asset = {
      id: asset.id || '',
      filename: asset.filename || '',
      original_filename: asset.original_filename || asset.filename || 'Unnamed file',
      url: asset.url || '',
      thumbnailUrl: asset.thumbnailUrl || '',
      assetType: asset.asset_type || asset.assetType || 'document',
      mimeType: asset.mime_type || asset.mimeType || 'application/octet-stream',
      size: typeof asset.size_bytes === 'number' ? asset.size_bytes : 
            typeof asset.size === 'number' ? asset.size : 0,
      tags: Array.isArray(asset.tags) ? asset.tags : [],
      createdAt: asset.created_at || asset.createdAt || new Date().toISOString(),
      usageCount: typeof asset.usage_count === 'number' ? asset.usage_count : 
                  typeof asset.usageCount === 'number' ? asset.usageCount : 0,
      metadata: asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : {}
    };
    
    // Add optional properties if they exist
    if (asset.dimensions && typeof asset.dimensions === 'object') {
      validatedAsset.dimensions = {
        width: typeof asset.dimensions.width === 'number' ? asset.dimensions.width : 0,
        height: typeof asset.dimensions.height === 'number' ? asset.dimensions.height : 0
      };
    } else if (typeof asset.width === 'number' && typeof asset.height === 'number') {
      validatedAsset.dimensions = {
        width: asset.width,
        height: asset.height
      };
    }
    
    if (typeof asset.duration === 'number') {
      validatedAsset.duration = asset.duration;
    }
    
    return validatedAsset;
  }

  /**
   * Get asset by ID
   * @param id - Asset ID
   * @returns - Asset details
   */
  async getAssetById(id: string): Promise<Asset> {
    // Get userId using the new method
    const userId = await this.getUserId();

    try {
      const response = await fetch(`${API_URL}/assets/${id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch asset');
      }

      const data = await response.json();
      return data.asset;
    } catch (error) {
      console.error('Get asset failed:', error);
      throw error;
    }
  }

  /**
   * Delete asset
   * @param id - Asset ID
   * @returns - Success status
   */
  async deleteAsset(id: string): Promise<boolean> {
    // Get userId using the new method
    const userId = await this.getUserId();

    try {
      const response = await fetch(`${API_URL}/assets/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete asset');
      }

      return true;
    } catch (error) {
      console.error('Delete asset failed:', error);
      throw error;
    }
  }

  /**
   * Update asset metadata
   * @param id - Asset ID
   * @param metadata - Updated metadata
   * @returns - Updated asset
   */
  async updateAssetMetadata(
    id: string,
    metadata: { tags?: string[]; description?: string }
  ): Promise<Asset> {
    // Get userId using the new method
    const userId = await this.getUserId();

    try {
      const response = await fetch(`${API_URL}/assets/${id}/metadata`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify(metadata)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update metadata');
      }

      const data = await response.json();
      return data.asset;
    } catch (error) {
      console.error('Update metadata failed:', error);
      throw error;
    }
  }

  /**
   * Record asset usage
   * @param id - Asset ID
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @returns - Usage record
   */
  async recordAssetUsage(id: string, entityType: string, entityId: string): Promise<any> {
    // Get userId using the new method
    const userId = await this.getUserId();

    try {
      const response = await fetch(`${API_URL}/assets/${id}/usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({ entityType, entityId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to record usage');
      }

      const data = await response.json();
      return data.usage;
    } catch (error) {
      console.error('Record usage failed:', error);
      throw error;
    }
  }

  /**
   * Get asset usage information
   * @param id - Asset ID
   * @returns - Usage information
   */
  async getAssetUsage(id: string): Promise<any> {
    // Get userId using the new method
    const userId = await this.getUserId();

    try {
      const response = await fetch(`${API_URL}/assets/${id}/usage`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get usage info');
      }

      const data = await response.json();
      return data.usage;
    } catch (error) {
      console.error('Get usage failed:', error);
      throw error;
    }
  }

  /**
   * Get asset statistics
   * @returns - Asset statistics
   */
  async getAssetStatistics(): Promise<any> {
    // Get userId using the new method
    const userId = await this.getUserId();

    try {
      const response = await fetch(`${API_URL}/assets/stats`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get asset statistics');
      }

      const data = await response.json();
      return data.stats;
    } catch (error) {
      console.error('Get statistics failed:', error);
      throw error;
    }
  }

  /**
   * Format file size for display
   * @param bytes - Size in bytes
   * @returns - Formatted size
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export default new AssetService(); 