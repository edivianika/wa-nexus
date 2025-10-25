import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AssetGrid } from './AssetGrid';
import { AssetUploadModal } from './AssetUploadModal';
import assetService, { Asset, AssetFilter } from '../../services/assetService';
import { FileImage, Image, Video, AudioLines, File, Loader2, Search, RefreshCcw } from "lucide-react";
import { toast } from 'sonner';

interface AssetPickerProps {
  assetType?: string;
  onAssetSelect: (asset: Asset) => void;
  buttonLabel?: string;
  triggerElement?: React.ReactNode;
  onlyImages?: boolean;
}

export function AssetPicker({
  assetType = "all",
  onAssetSelect,
  buttonLabel = "Pilih Media",
  triggerElement,
  onlyImages = false
}: AssetPickerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [totalAssets, setTotalAssets] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState(onlyImages ? "image" : assetType);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const ITEMS_PER_PAGE = 12;

  // Reset to first page when changing type or search
  useEffect(() => {
    if (open) {
      setCurrentPage(1);
    }
  }, [selectedType, searchQuery, open]);

  // Load assets when needed
  useEffect(() => {
    if (open) {
      loadAssets();
    }
  }, [open, currentPage, selectedType, refreshTrigger]);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const filters: AssetFilter = {
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
        sort: 'created_at:desc'
      };

      if (selectedType !== 'all') {
        filters.type = selectedType;
      } else if (onlyImages) {
        filters.type = 'image';
      }

      if (searchQuery) {
        filters.search = searchQuery;
      }

      const result = await assetService.getAssets(filters);
      
      // Validate that we have valid assets before setting state
      if (result && Array.isArray(result.assets)) {
        // Filter out any potentially invalid assets
        const validAssets = result.assets.filter(asset => 
          asset && typeof asset === 'object' && asset.id
        );
        
        setAssets(validAssets);
        setTotalAssets(result.total || validAssets.length);
      } else {
        console.error('Invalid assets response:', result);
        setAssets([]);
        setTotalAssets(0);
        toast.error('Gagal memuat data media');
      }
    } catch (error) {
      console.error('Error loading assets:', error);
      toast.error(error instanceof Error ? error.message : 'Gagal memuat asset');
      
      // If there was an authentication error, we can show a more helpful message
      if (error instanceof Error && error.message.includes('User ID')) {
        toast.error('Sesi login Anda telah berakhir. Silakan login kembali.');
      }
      
      // Reset assets on error
      setAssets([]);
      setTotalAssets(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (asset: Asset) => {
    onAssetSelect(asset);
    setOpen(false);
  };

  const handleAssetUploaded = (asset: Asset) => {
    setRefreshTrigger(prev => prev + 1);
    handleSelect(asset);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadAssets();
  };

  const getTotalPages = () => {
    return Math.ceil(totalAssets / ITEMS_PER_PAGE);
  };

  const renderPagination = () => {
    const totalPages = getTotalPages();
    
    return (
      <div className="flex justify-between items-center mt-6">
        <div className="text-sm text-muted-foreground">
          Menampilkan {assets.length} dari {totalAssets} asset
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1 || loading}
          >
            Sebelumnya
          </Button>
          <div className="text-sm px-4">
            Halaman {currentPage} dari {totalPages || 1}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage >= totalPages || loading}
          >
            Berikutnya
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerElement || (
          <Button variant="outline" size="sm" className="gap-1">
            <FileImage className="h-4 w-4" />
            {buttonLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pilih Media</DialogTitle>
        </DialogHeader>

        <div className="flex justify-between items-center mb-4">
          <Tabs 
            defaultValue={onlyImages ? "image" : "all"} 
            value={selectedType} 
            onValueChange={(value) => {
              setSelectedType(value);
              setCurrentPage(1);
            }}
            className="w-full"
          >
            <div className="flex justify-between items-center">
              <TabsList>
                {!onlyImages && (
                  <TabsTrigger value="all" className="gap-1">
                    Semua
                  </TabsTrigger>
                )}
                <TabsTrigger value="image" className="gap-1">
                  <Image className="h-4 w-4" />
                  Gambar
                </TabsTrigger>
                {!onlyImages && (
                  <>
                    <TabsTrigger value="video" className="gap-1">
                      <Video className="h-4 w-4" />
                      Video
                    </TabsTrigger>
                    <TabsTrigger value="audio" className="gap-1">
                      <AudioLines className="h-4 w-4" />
                      Audio
                    </TabsTrigger>
                    <TabsTrigger value="document" className="gap-1">
                      <File className="h-4 w-4" />
                      Dokumen
                    </TabsTrigger>
                  </>
                )}
              </TabsList>
              <AssetUploadModal onSuccess={handleAssetUploaded} />
            </div>
          </Tabs>
        </div>

        <div className="mb-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Cari berdasarkan nama file atau tag..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button type="submit" variant="default" size="sm">
              Cari
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setRefreshTrigger(prev => prev + 1);
              }}
              className="gap-1"
            >
              <RefreshCcw className="h-3 w-3" />
              Reset
            </Button>
          </form>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <AssetGrid
            assets={assets}
            onSelectAsset={handleSelect}
            selectable={true}
          />
        )}

        {!loading && assets.length > 0 && renderPagination()}
      </DialogContent>
    </Dialog>
  );
} 