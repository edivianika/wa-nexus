import { useState } from "react";
import { FileUpload } from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Database, Upload, Image, FileText } from "lucide-react";

const UploadPage = () => {
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [multipleFiles, setMultipleFiles] = useState<File[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);

  const handleSingleFileUpload = (files: File[]) => {
    setSingleFile(files[0] || null);
  };

  const handleMultipleFilesUpload = (files: File[]) => {
    setMultipleFiles(files);
  };

  const handleImageUpload = (files: File[]) => {
    setImageFiles(files);
  };

  const handleDocumentUpload = (files: File[]) => {
    setDocumentFiles(files);
  };

  const handleSubmit = (type: string) => {
    // Simpulasi pengiriman file ke server
    return new Promise<void>((resolve) => {
      // Simulasi waktu pengiriman
      setTimeout(() => {
        toast.success(`${type} berhasil diunggah!`);
        resolve();
      }, 1500);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Upload Files</h1>
      </div>

      <Tabs defaultValue="single">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="single" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            <span>Single File</span>
          </TabsTrigger>
          <TabsTrigger value="multiple" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            <span>Multiple Files</span>
          </TabsTrigger>
          <TabsTrigger value="images" className="flex items-center gap-2">
            <Image className="h-4 w-4" />
            <span>Gambar</span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>Dokumen</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single">
          <Card>
            <CardHeader>
              <CardTitle>Upload Single File</CardTitle>
              <CardDescription>
                Unggah satu file dengan batas ukuran maksimal 50MB.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileUpload 
                onFileUpload={handleSingleFileUpload}
                multiple={false}
              />
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button 
                disabled={!singleFile}
                onClick={() => handleSubmit('File tunggal')}
              >
                Unggah File
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="multiple">
          <Card>
            <CardHeader>
              <CardTitle>Upload Multiple Files</CardTitle>
              <CardDescription>
                Unggah beberapa file sekaligus dengan batas 10 file.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileUpload 
                onFileUpload={handleMultipleFilesUpload}
                multiple={true}
                maxFiles={10}
              />
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button 
                disabled={multipleFiles.length === 0}
                onClick={() => handleSubmit('Multiple files')}
              >
                Unggah {multipleFiles.length} File
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="images">
          <Card>
            <CardHeader>
              <CardTitle>Upload Gambar</CardTitle>
              <CardDescription>
                Unggah gambar dalam format JPG, PNG, GIF, atau WebP.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileUpload 
                onFileUpload={handleImageUpload}
                multiple={true}
                maxFiles={5}
                acceptedFileTypes={["image/jpeg", "image/png", "image/gif", "image/webp"]}
              />
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button 
                disabled={imageFiles.length === 0}
                onClick={() => handleSubmit('Gambar')}
              >
                Unggah {imageFiles.length} Gambar
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>Upload Dokumen</CardTitle>
              <CardDescription>
                Unggah dokumen dalam format PDF, Word, Excel, atau Text.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileUpload 
                onFileUpload={handleDocumentUpload}
                multiple={true}
                maxFiles={5}
                acceptedFileTypes={[
                  "application/pdf", 
                  ".doc", ".docx", 
                  ".xls", ".xlsx", 
                  ".txt"
                ]}
              />
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button 
                disabled={documentFiles.length === 0}
                onClick={() => handleSubmit('Dokumen')}
              >
                Unggah {documentFiles.length} Dokumen
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UploadPage; 