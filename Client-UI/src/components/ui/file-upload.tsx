import React, { useState, useRef } from 'react';
import { Button } from './button';
import { Upload } from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface FileUploadProps {
  onFileUpload: (files: File[]) => void;
  multiple?: boolean;
  acceptedFileTypes?: string[];
  maxSizeMB?: number;
  maxFiles?: number;
  className?: string;
  formatDisplayText?: string;
  disabled?: boolean;
  buttonClassName?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onFileUpload,
  multiple = false,
  acceptedFileTypes = [],
  maxSizeMB = 5,
  maxFiles = 3,
  className = '',
  formatDisplayText = '',
  disabled = false,
  buttonClassName = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      processFiles(filesArray);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      processFiles(filesArray);
    }
  };

  const processFiles = (files: File[]) => {
    // Server akan menangani validasi dan batasan
    onFileUpload(files);
    
    // Reset input file agar pengguna dapat mengunggah file yang sama lagi
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleButtonClick = () => {
    if (disabled) return;
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const acceptedTypes = acceptedFileTypes.length > 0 
    ? acceptedFileTypes.join(',') 
    : undefined;

  return (
    <div 
      className={cn(
        "border border-dotted border-input rounded-lg p-5 bg-background/60 flex flex-col items-center transition-all w-full max-w-xs cursor-pointer",
        isDragging ? 'border-primary bg-primary/10' : 'hover:border-primary/50',
        disabled ? 'opacity-50 pointer-events-none cursor-not-allowed' : '',
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleButtonClick}
      aria-disabled={disabled}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        multiple={multiple}
        accept={acceptedTypes}
        disabled={disabled}
      />
      <div className="flex flex-col items-center gap-2 w-full">
        <div className="text-primary mb-1">
          <Upload className="w-8 h-8" />
        </div>
        <span className="text-lg font-bold">Upload Contacts (CSV)</span>
        <Button
          type="button"
          variant="default"
          size="sm"
          className={cn("w-full text-sm px-3 py-1.5 mt-4", buttonClassName)}
          disabled={disabled}
        >
          Upload CSV
        </Button>
        <span className="text-xs text-muted-foreground mt-2">
          Maksimal {maxSizeMB} MB &middot; Format: .csv
        </span>
      </div>
    </div>
  );
}; 