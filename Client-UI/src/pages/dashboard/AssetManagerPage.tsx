import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssetGrid } from '@/components/asset/AssetGrid';
import { AssetUploadModal } from '@/components/asset/AssetUploadModal';
import { Asset, AssetFilter } from '@/services/assetService';
import assetService from '@/services/assetService';
import { Loader2, Search, SlidersHorizontal, X, ImageIcon, Video, File, AudioLines, HardDrive, Tag, RefreshCcw, Plus } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { toast } from 'sonner';
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function AssetManagerPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [totalAssets, setTotalAssets] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssetType, setSelectedAssetType] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('created_at:desc');
  const [statistics, setStatistics] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deletingAsset, setDeletingAsset] = useState<Asset | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const ITEMS_PER_PAGE = 20;

  // Load assets
  useEffect(() => {
    loadAssets();
    loadStatistics();
  }, [currentPage, selectedAssetType, searchQuery, selectedTags, sortBy]);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const filters: AssetFilter = {
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
        sort: sortBy
      };

      if (selectedAssetType !== 'all') {
        filters.type = selectedAssetType;
      }

      if (searchQuery) {
        filters.search = searchQuery;
      }

      if (selectedTags.length > 0) {
        filters.tags = selectedTags;
      }

      const result = await assetService.getAssets(filters);
      setAssets(result.assets);
      setTotalAssets(result.total);
    } catch (error) {
      console.error('Error loading assets:', error);
      toast.error('Gagal memuat asset');
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async () => {
    setLoadingStats(true);
    try {
      const stats = await assetService.getAssetStatistics();
      setStatistics(stats);
    } catch (error) {
      console.error('Error loading statistics:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleAssetUploaded = (newAsset: Asset) => {
    // Refresh asset list
    loadAssets();
    loadStatistics();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1); // Reset to first page on new search
  };

  const handleTagSelect = (tag: string) => {
    if (!selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag]);
      setCurrentPage(1); // Reset to first page on filter change
    }
  };

  const handleRemoveTag = (tag: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tag));
    setCurrentPage(1); // Reset to first page on filter change
  };

  const clearFilters = () => {
    setSelectedAssetType('all');
    setSearchQuery('');
    setSelectedTags([]);
    setSortBy('created_at:desc');
    setCurrentPage(1);
  };

  const handleEditAsset = (asset: Asset) => {
    setEditingAsset(asset);
    setEditTags(asset.tags || []);
    setEditDescription(asset.metadata?.description || '');
    setEditDialogOpen(true);
  };

  const handleDeleteAsset = (asset: Asset) => {
    setDeletingAsset(asset);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingAsset) return;
    
    setDeleting(true);
    try {
      await assetService.deleteAsset(deletingAsset.id);
      toast.success('Asset berhasil dihapus');
      loadAssets();
      loadStatistics();
      setDeleteDialogOpen(false);
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast.error('Gagal menghapus asset');
    } finally {
      setDeleting(false);
      setDeletingAsset(null);
    }
  };

  const saveAssetChanges = async () => {
    if (!editingAsset) return;
    
    setSaving(true);
    try {
      const metadata = {
        tags: editTags,
        description: editDescription
      };
      
      await assetService.updateAssetMetadata(editingAsset.id, metadata);
      toast.success('Asset berhasil diperbarui');
      loadAssets();
      setEditDialogOpen(false);
    } catch (error) {
      console.error('Error updating asset:', error);
      toast.error('Gagal memperbarui asset');
    } finally {
      setSaving(false);
    }
  };

  const handleAddEditTag = () => {
    if (editTagInput.trim() && !editTags.includes(editTagInput.trim())) {
      setEditTags([...editTags, editTagInput.trim()]);
      setEditTagInput('');
    }
  };

  const handleRemoveEditTag = (tagToRemove: string) => {
    setEditTags(editTags.filter(tag => tag !== tagToRemove));
  };

  const handleEditTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddEditTag();
    }
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

  const renderStatistics = () => {
    if (loadingStats) {
      return (
        <div className="p-4 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!statistics) {
      return (
        <div className="p-4 text-center text-sm text-muted-foreground">
          Tidak dapat memuat statistik
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Total Asset</span>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{statistics.totalAssets || 0}</span>
              <HardDrive className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Ukuran Penyimpanan</span>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{assetService.formatFileSize(statistics.totalStorage || 0)}</span>
              <HardDrive className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Jumlah Gambar</span>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">
                {statistics.byType?.find((t: any) => t.asset_type === 'image')?.count || 0}
              </span>
              <ImageIcon className="h-5 w-5 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Jumlah Video</span>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">
                {statistics.byType?.find((t: any) => t.asset_type === 'video')?.count || 0}
              </span>
              <Video className="h-5 w-5 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Media Manager</h2>
          <p className="text-muted-foreground">
            Kelola semua media untuk kampanye dan pesan WhatsApp Anda
          </p>
        </div>
        <AssetUploadModal onSuccess={handleAssetUploaded} />
      </div>

      {renderStatistics()}

      <Card>
        <CardHeader className="p-4 pb-0">
          <div className="flex flex-col md:flex-row justify-between gap-4">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
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
              <Button type="submit" variant="default">
                Cari
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-1"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filter
              </Button>
            </form>
          </div>

          {showFilters && (
            <div className="mt-4 p-4 border rounded-md space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <Label className="text-sm">Tipe:</Label>
                <Tabs value={selectedAssetType} onValueChange={setSelectedAssetType} className="mr-4">
                  <TabsList>
                    <TabsTrigger value="all" className="gap-1">
                      Semua
                    </TabsTrigger>
                    <TabsTrigger value="image" className="gap-1">
                      <ImageIcon className="h-4 w-4" />
                      Gambar
                    </TabsTrigger>
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
                  </TabsList>
                </Tabs>
              </div>

              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-2 items-center">
                  <Label className="text-sm">Tag aktif:</Label>
                  <div className="flex flex-wrap gap-1">
                    {selectedTags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() => handleRemoveTag(tag)}
                        />
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 items-center">
                <Label className="text-sm">Urutkan:</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Pilih urutan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at:desc">Terbaru</SelectItem>
                    <SelectItem value="created_at:asc">Terlama</SelectItem>
                    <SelectItem value="original_filename:asc">Nama (A-Z)</SelectItem>
                    <SelectItem value="original_filename:desc">Nama (Z-A)</SelectItem>
                    <SelectItem value="size_bytes:desc">Ukuran (Terbesar)</SelectItem>
                    <SelectItem value="size_bytes:asc">Ukuran (Terkecil)</SelectItem>
                    <SelectItem value="usage_count:desc">Penggunaan (Terbanyak)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={clearFilters} className="gap-1">
                  <RefreshCcw className="h-3 w-3" />
                  Reset Filter
                </Button>
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-4">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <AssetGrid
              assets={assets}
              onEditAsset={handleEditAsset}
              onDeleteAsset={handleDeleteAsset}
            />
          )}

          {!loading && assets.length > 0 && renderPagination()}
        </CardContent>
      </Card>

      {/* Edit Asset Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Asset</DialogTitle>
            <DialogDescription>
              Perbarui informasi untuk asset ini
            </DialogDescription>
          </DialogHeader>
          
          {editingAsset && (
            <div className="grid gap-4 py-2">
              <div className="flex justify-center mb-2">
                {editingAsset.assetType === 'image' ? (
                  <img
                    src={editingAsset.thumbnailUrl || editingAsset.url}
                    alt={editingAsset.original_filename}
                    className="max-h-[200px] rounded-md object-contain"
                  />
                ) : (
                  <div className="p-6 bg-muted rounded-md">
                    <File className="h-12 w-12 text-primary" />
                  </div>
                )}
              </div>
              
              <div className="text-sm">
                <div className="font-medium">{editingAsset.original_filename}</div>
                <div className="text-muted-foreground">
                  {assetService.formatFileSize(editingAsset.size)} • {editingAsset.mimeType}
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="description">Deskripsi (Opsional)</Label>
                <Textarea
                  id="description"
                  placeholder="Tambahkan deskripsi untuk media ini"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                />
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="tags">Tag (Opsional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="tags"
                    placeholder="Tambahkan tag dan tekan Enter"
                    value={editTagInput}
                    onChange={(e) => setEditTagInput(e.target.value)}
                    onKeyDown={handleEditTagKeyDown}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAddEditTag}
                    disabled={!editTagInput.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {editTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {editTags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="gap-1 px-2 py-1">
                        {tag}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() => handleRemoveEditTag(tag)}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={saveAssetChanges} disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Konfirmasi Penghapusan</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus asset ini? Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          
          {deletingAsset && (
            <div className="flex items-center gap-4 py-4">
              {deletingAsset.assetType === 'image' ? (
                <img
                  src={deletingAsset.thumbnailUrl || deletingAsset.url}
                  alt={deletingAsset.original_filename}
                  className="w-16 h-16 rounded-md object-cover"
                />
              ) : (
                <div className="w-16 h-16 bg-muted rounded-md flex items-center justify-center">
                  <File className="h-8 w-8 text-primary" />
                </div>
              )}
              <div>
                <div className="font-medium">{deletingAsset.original_filename}</div>
                <div className="text-sm text-muted-foreground">
                  {assetService.formatFileSize(deletingAsset.size)}
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? 'Menghapus...' : 'Hapus Asset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 