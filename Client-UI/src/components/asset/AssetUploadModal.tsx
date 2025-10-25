import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { X, Upload, FileImage, FileVideo, FileAudio, FileText, Plus } from "lucide-react";
import { toast } from 'sonner';
import { Asset } from '../../services/assetService';
import assetService from '../../services/assetService';

interface AssetUploadModalProps {
  onSuccess: (asset: Asset) => void;
  trigger?: React.ReactNode;
}

export function AssetUploadModal({ onSuccess, trigger }: AssetUploadModalProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const selectedFile = event.target.files[0];
      setFile(selectedFile);

      // Create preview for image files
      if (selectedFile.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPreview(e.target?.result as string);
        };
        reader.readAsDataURL(selectedFile);
      } else {
        setPreview(null);
      }
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const getFileIcon = () => {
    if (!file) return <Upload className="h-10 w-10 text-muted-foreground" />;
    
    const type = file.type;
    if (type.startsWith('image/')) {
      return <FileImage className="h-10 w-10 text-blue-500" />;
    } else if (type.startsWith('video/')) {
      return <FileVideo className="h-10 w-10 text-red-500" />;
    } else if (type.startsWith('audio/')) {
      return <FileAudio className="h-10 w-10 text-green-500" />;
    } else {
      return <FileText className="h-10 w-10 text-amber-500" />;
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Silakan pilih file untuk diunggah');
      return;
    }

    setUploading(true);
    try {
      const metadata = {
        description,
        tags
      };

      const asset = await assetService.uploadAsset(file, metadata);
      
      // Validate that we received a valid asset
      if (asset && asset.id && asset.url) {
        toast.success('File berhasil diunggah');
        onSuccess(asset);
        resetForm();
        setOpen(false);
      } else {
        console.error('Invalid asset data received after upload:', asset);
        toast.error('Gagal memproses file yang diunggah');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Gagal mengunggah file');
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setPreview(null);
    setTags([]);
    setDescription('');
    setTagInput('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" className="gap-1">
            <Plus className="h-4 w-4" />
            Unggah Media
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Unggah Media Baru</DialogTitle>
          <DialogDescription>
            Unggah file media untuk digunakan dalam pesan WhatsApp
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="file">File</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                file ? 'border-primary/30 bg-primary/5' : 'border-muted-foreground/30'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                id="file"
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*,video/*,audio/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              />
              
              {preview ? (
                <div className="relative w-full max-w-[200px]">
                  <img
                    src={preview}
                    alt="Preview"
                    className="w-full h-auto rounded-md max-h-[200px] object-contain mx-auto"
                    onError={(e) => {
                      // If preview fails to load, show the file icon instead
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        // Create a fallback div
                        const fallback = document.createElement('div');
                        fallback.className = 'flex items-center justify-center h-full w-full';
                        
                        // Add a simple icon as text
                        if (file?.type.startsWith('image/')) {
                          fallback.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>';
                        } else if (file?.type.startsWith('video/')) {
                          fallback.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-500"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
                        } else {
                          fallback.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-500"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
                        }
                        
                        parent.appendChild(fallback);
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="mb-2">{getFileIcon()}</div>
              )}
              
              {file ? (
                <>
                  <p className="text-sm font-medium mt-2">{file.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {assetService.formatFileSize(file.size)} • {file.type}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetForm();
                    }}
                  >
                    Ganti File
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium mt-2">Klik untuk memilih file</p>
                  <p className="text-xs text-muted-foreground text-center mt-1">
                    Mendukung file gambar, video, audio, dan dokumen
                    <br />
                    Ukuran maksimum 25MB
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="description">Deskripsi (Opsional)</Label>
            <Textarea
              id="description"
              placeholder="Tambahkan deskripsi untuk media ini"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="tags">Tag (Opsional)</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                placeholder="Tambahkan tag dan tekan Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddTag}
                disabled={!tagInput.trim()}
              >
                Tambah
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="gap-1 px-2 py-1">
                    {tag}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => handleRemoveTag(tag)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? 'Mengunggah...' : 'Unggah'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 