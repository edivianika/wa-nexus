import React from 'react';
import { Asset } from '../../services/assetService';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Trash2, Edit, ExternalLink, FileText, FileImage, FileVideo, FileAudio } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import assetService from '../../services/assetService';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AssetGridProps {
  assets: Asset[];
  onSelectAsset?: (asset: Asset) => void;
  onDeleteAsset?: (asset: Asset) => void;
  onEditAsset?: (asset: Asset) => void;
  selectable?: boolean;
}

export function AssetGrid({ assets, onSelectAsset, onDeleteAsset, onEditAsset, selectable = false }: AssetGridProps) {
  if (!assets || assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <FileText className="h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">Tidak ada asset ditemukan</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Unggah asset baru atau coba filter yang berbeda
        </p>
      </div>
    );
  }

  const getAssetIcon = (asset: Asset) => {
    switch (asset.assetType) {
      case 'image':
        return <FileImage className="h-4 w-4" />;
      case 'video':
        return <FileVideo className="h-4 w-4" />;
      case 'audio':
        return <FileAudio className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const renderAssetPreview = (asset: Asset) => {
    // Default fallback for all asset types
    const renderFallbackIcon = (iconType: string) => {
      let Icon = FileText;
      let iconColor = "text-slate-400";
      
      switch (iconType) {
        case 'image':
          Icon = FileImage;
          iconColor = "text-blue-500";
          break;
        case 'video':
          Icon = FileVideo;
          iconColor = "text-red-500";
          break;
        case 'audio':
          Icon = FileAudio;
          iconColor = "text-green-500";
          break;
      }
      
      return (
        <div className="aspect-square w-full overflow-hidden rounded-md bg-slate-100 flex items-center justify-center">
          <Icon className={`h-12 w-12 ${iconColor}`} />
        </div>
      );
    };
    
    if (asset.assetType === 'image') {
      // Check if we have a valid URL
      if (!asset.url && !asset.thumbnailUrl) {
        return renderFallbackIcon('image');
      }
      
      return (
        <div className="aspect-square w-full overflow-hidden rounded-md relative bg-slate-100">
          <img
            src={asset.thumbnailUrl || asset.url}
            alt={asset.original_filename || asset.filename || 'Image'}
            className="h-full w-full object-contain transition-all hover:scale-105"
            loading="lazy"
            onError={(e) => {
              // If image fails to load, show a fallback icon
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                const fallback = document.createElement('div');
                fallback.className = 'flex items-center justify-center h-full w-full';
                fallback.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>';
                parent.appendChild(fallback);
              }
            }}
          />
        </div>
      );
    } else if (asset.assetType === 'video') {
      if (!asset.thumbnailUrl && !asset.url) {
        return renderFallbackIcon('video');
      }
      
      return (
        <div className="aspect-square w-full overflow-hidden rounded-md relative bg-slate-100 flex items-center justify-center">
          {asset.thumbnailUrl ? (
            <img
              src={asset.thumbnailUrl}
              alt={asset.original_filename || asset.filename || 'Video'}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => {
                // If thumbnail fails, just show the video icon
                return renderFallbackIcon('video');
              }}
            />
          ) : (
            <FileVideo className="h-12 w-12 text-slate-400" />
          )}
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <div className="rounded-full bg-white/80 p-2">
              <FileVideo className="h-8 w-8 text-primary" />
            </div>
          </div>
        </div>
      );
    } else if (asset.assetType === 'audio') {
      return renderFallbackIcon('audio');
    } else {
      return renderFallbackIcon('document');
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {assets.map((asset) => (
        <Card key={asset.id} className="overflow-hidden border shadow-sm hover:shadow-md transition-all">
          <div
            className="cursor-pointer"
            onClick={() => selectable && onSelectAsset && onSelectAsset(asset)}
          >
            {renderAssetPreview(asset)}
          </div>
          <CardContent className="p-3">
            <div className="flex justify-between items-start gap-2">
              <div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <h3 className="font-medium text-sm truncate max-w-[150px]">
                        {asset.original_filename || asset.filename || 'Unnamed file'}
                      </h3>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{asset.original_filename || asset.filename || 'Unnamed file'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <div className="flex items-center gap-1 mt-1">
                  <Badge variant="outline" className="text-xs py-0 h-5">
                    <span className="flex items-center gap-1">
                      {getAssetIcon(asset)}
                      {asset.assetType || 'unknown'}
                    </span>
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {typeof asset.size === 'number' ? assetService.formatFileSize(asset.size) : 'Unknown size'}
                  </span>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 p-0">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {selectable && onSelectAsset && (
                    <DropdownMenuItem onClick={() => onSelectAsset(asset)}>
                      <span className="flex items-center gap-2">
                        <ExternalLink className="h-4 w-4" />
                        Pilih
                      </span>
                    </DropdownMenuItem>
                  )}
                  {onEditAsset && (
                    <DropdownMenuItem onClick={() => onEditAsset(asset)}>
                      <span className="flex items-center gap-2">
                        <Edit className="h-4 w-4" />
                        Edit metadata
                      </span>
                    </DropdownMenuItem>
                  )}
                  {onDeleteAsset && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDeleteAsset(asset)}
                    >
                      <span className="flex items-center gap-2">
                        <Trash2 className="h-4 w-4" />
                        Hapus
                      </span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {asset.tags && asset.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {asset.tags.slice(0, 3).map((tag, index) => (
                  <Badge key={index} variant="secondary" className="text-xs py-0 h-5">
                    {tag}
                  </Badge>
                ))}
                {asset.tags.length > 3 && (
                  <Badge variant="secondary" className="text-xs py-0 h-5">
                    +{asset.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
} 