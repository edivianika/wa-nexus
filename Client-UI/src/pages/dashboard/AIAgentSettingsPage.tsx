import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, MessageSquare, BookOpen, ArrowLeft, Settings as SettingsIcon, Bot, Plus, Trash2, Download, File, FileSpreadsheet, FileText, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FileUpload } from "@/components/ui/file-upload";

// Konstanta untuk server URL dari environment variable
const API_SERVER_URL = import.meta.env.VITE_API_SERVER_URL || 'https://api.wa-nexus.id';

// Interface untuk data agen AI
interface AIAgent {
  id: string;
  name: string;
  description: string;
  type: "customer-service" | "sales" | "custom";
  status: "active" | "inactive";
  created_at: string;
  settings: {
    integration: {
      webhook_url: string;
      auto_reply: boolean;
      notification: boolean;
    };
    behaviour: {
      greeting: string;
      response_time: "quick" | "thorough";
      tone: "formal" | "casual" | "friendly";
    };
    knowledge: {
      sources: string[];
      custom_data: string;
    };
    more_settings?: {
      humanlike_behaviour?: boolean;
      multi_bubble_chat?: boolean;
      stop_ai_if_cs_replied?: boolean;
      ai_handle_back_after_minutes?: number;
      read_receipts?: boolean;
    };
  };
}

// Interface untuk data device
interface Device {
  id: string;
  name: string;
  status: "active" | "inactive";
  type: string;
  last_active: string;
  ai_agent_id?: string | null;
  disabled?: boolean;
}

// Tambahkan di awal file, dalam interface untuk state
interface UploadedFile {
  id: string;
  filename: string;
  size: number;
  type: string;
  uploaded_at: string;
  path: string;
  original_filename?: string; // Nama file sebenarnya di server
  exists?: boolean;
  status?: string; // Status file: "pending" atau "ready"
}

// Interface untuk data dari database Supabase
interface FileRecord {
  id: string;
  filename: string;
  original_filename?: string;
  mimetype: string;
  size: number;
  file_path: string;
  user_id: string;
  agent_id: string;
  created_at: string;
  updated_at?: string;
  status?: string; // Status file: "pending" atau "ready"
}

// Konstanta untuk document API URL dari environment variable
const DOCUMENT_API_URL = import.meta.env.VITE_DOCUMENT_API_URL || 'http://localhost:1212';

// Konstanta untuk localStorage key
const FILES_STORAGE_KEY = 'agent_files_';

// Konstanta untuk pembatasan file
const MAX_FILES_PER_AGENT = 3;
const MAX_FILE_SIZE_MB = 5;
const ACCEPTED_FILE_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/csv", "application/json", "application/epub+zip"];
const VALID_EXTENSIONS = ['pdf', 'docx', 'txt', 'csv', 'json', 'epub'];

const AIAgentSettingsPage = () => {
  const navigate = useNavigate();
  const { agentId } = useParams();
  const [activeTab, setActiveTab] = useState("integration");
  const [agent, setAgent] = useState<AIAgent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{
    id: string;
    filename: string;
    size: number;
    type: string;
    uploaded_at: string;
    path: string;
    original_filename?: string;
    exists?: boolean;
    status?: string;
  }>>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [fileLoadError, setFileLoadError] = useState<string | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [hasAttemptedFileLoad, setHasAttemptedFileLoad] = useState(false);

  // Mendapatkan user ID dan data agen pada saat komponen dimuat
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      try {
        // Ambil user ID terlebih dahulu
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.id) {
          setUserId(userData.user.id);
          console.log("User ID ditemukan:", userData.user.id);
        } else {
          console.error("User ID tidak ditemukan");
          toast.error("Gagal mendapatkan ID pengguna");
        }

        // Ambil data agen jika ada agentId
        if (agentId) {
          // Gunakan timeout untuk mencegah loading tak terbatas
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 detik timeout
          
          try {
            const { data, error } = await supabase
              .from('ai_agents')
              .select('*')
              .eq('id', agentId)
              .single();
              
            clearTimeout(timeoutId);
            
            if (error) {
              console.error("Error mendapatkan data agen:", error);
              toast.error("Gagal memuat Agen AI");
              return;
            }
            
            if (!data) {
              console.error("Agen tidak ditemukan");
              toast.error("Agen AI tidak ditemukan");
              return;
            }
            
            // Ubah data yang diterima agar sesuai dengan interface AIAgent
            const agentData = {
              id: data.id,
              name: data.name,
              description: data.description,
              type: (data.type as "customer-service" | "sales" | "custom") || "custom",
              status: (data.status as "active" | "inactive") || "inactive",
              created_at: data.created_at,
              settings: data.settings as AIAgent['settings']
            };
            
            setAgent(agentData);
            console.log("Data agen berhasil dimuat:", data.name);
            
            // Ambil data devices setelah agen dimuat
            fetchDevices(userData?.user?.id);
          } catch (error) {
            console.error("Error dalam fetchInitialData:", error);
            if (error.name === 'AbortError') {
              toast.error("Timeout saat memuat data agen");
            } else {
              toast.error("Gagal memuat data agen");
            }
          }
        }
      } catch (error) {
        console.error("Error dalam fetchInitialData:", error);
        toast.error("Gagal memuat data awal");
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [agentId]);

  // Fungsi untuk mengambil data devices
  const fetchDevices = async (uid: string | undefined) => {
    if (!uid) {
      console.error("User ID tidak tersedia untuk fetch devices");
      return;
    }
    
    try {
      const { data: connections, error } = await supabase
        .from('connections')
        .select('*')
        .eq('user_id', uid);
      
      if (error) {
        console.error("Error mengambil connections:", error);
        return;
      }
      
      if (connections && connections.length > 0) {
        // Cek device yang digunakan oleh agen lain
        const { data: usedConnectionsData } = await supabase
          .from('connections')
          .select('id, ai_agent_id')
          .not('ai_agent_id', 'is', null)
          .neq('ai_agent_id', agentId || '');
        
        const usedConnectionsMap = new Map();
        if (usedConnectionsData) {
          usedConnectionsData.forEach(conn => {
            usedConnectionsMap.set(conn.id, conn.ai_agent_id);
          });
        }
        
        setDevices(connections.map(connection => {
          const isUsedByCurrentAgent = connection.ai_agent_id === agentId;
          const isUsedByOtherAgent = !isUsedByCurrentAgent && usedConnectionsMap.has(connection.id);
          
          return {
            id: connection.id,
            name: connection.name,
            // Status active jika digunakan oleh agen ini (tidak bergantung pada connected)
            status: (isUsedByCurrentAgent) ? "active" : "inactive",
            type: connection.phone_number || "WhatsApp",
            last_active: connection.updated_at || connection.created_at,
            ai_agent_id: connection.ai_agent_id,
            // Device disabled jika digunakan oleh agen lain
            disabled: isUsedByOtherAgent
          };
        }));
      }
    } catch (error) {
      console.error("Error dalam fetchDevices:", error);
    }
  };

  // Muat data file dari localStorage saat komponen dimuat
  useEffect(() => {
    if (agentId) {
      const storedFiles = localStorage.getItem(FILES_STORAGE_KEY + agentId);
      if (storedFiles) {
        try {
          const parsedFiles = JSON.parse(storedFiles);
          setUploadedFiles(parsedFiles);
        } catch (error) {
          console.error('Error parsing stored files:', error);
        }
      }
    }
  }, [agentId]);

  // Untuk mendapatkan file fisik dari server, gunakan agentId sebagai filter dengan timeout
  const getFileInfo = async () => {
    if (!agentId) return;
    
    try {
      // Buat controller untuk timeout
      const controller = new AbortController();
      const signal = controller.signal;
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 detik timeout

      // Dapatkan device yang terhubung ke agen ini untuk mendapatkan server URL
      let serverUrl = API_SERVER_URL; // Default URL sebagai fallback
      
      if (devices && devices.length > 0) {
        // Cari device aktif yang terhubung ke agen ini
        const connectedDevice = devices.find(d => d.ai_agent_id === agentId && d.status === "active");
        
        // Jika ada device terhubung, gunakan server-nya
        if (connectedDevice) {
          // Dapatkan informasi lengkap device dari database
          const { data: deviceData } = await supabase
            .from('connections')
            .select('server')
            .eq('id', connectedDevice.id)
            .single();
            
          if (deviceData && deviceData.server) {
            serverUrl = deviceData.server;
            console.log(`Menggunakan server dari device terhubung: ${serverUrl}`);
          }
        }
      }
      
      // Gunakan endpoint yang sudah dimodifikasi dengan filter agentId
      const response = await fetch(`${serverUrl}/api/files-list?agentId=${agentId}`, {
        signal,
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      // Batalkan timeout
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error('Gagal mendapatkan informasi file');
      }
      
      const data = await response.json();
      console.log('Informasi file dari server:', data);
      
      // Simpan informasi untuk digunakan nanti
      if (data.files && Array.isArray(data.files)) {
        // Gunakan original_filename yang diterima dari server
        const filesWithOriginalNames = data.files.map(file => ({
          ...file,
          original_filename: file.original_filename || file.name
        }));
        localStorage.setItem('server_files_info_' + agentId, JSON.stringify(filesWithOriginalNames));
        
        // Update file di uploadedFiles jika ada
        setUploadedFiles(prevFiles => {
          return prevFiles.map(prevFile => {
            // Cari file yang sama di response server
            const matchingServerFile = filesWithOriginalNames.find(sf => 
              sf.name === prevFile.filename || 
              sf.path.includes(prevFile.path)
            );
            
            if (matchingServerFile) {
              return {
                ...prevFile,
                original_filename: matchingServerFile.original_filename
              };
            }
            return prevFile;
          });
        });
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('Request timeout saat mengambil informasi file');
      } else {
      console.error('Error saat mendapatkan informasi file:', error);
      }
    }
  };

  // Fungsi untuk mengambil metadata file dari server dan database dengan timeout
  const fetchFileMetadata = async () => {
    if (!agentId || !userId) {
      console.log("Skipping fetchFileMetadata - missing agentId or userId");
      return;
    }
    
    // Mencegah eksekusi berulang
    if (isLoadingFiles) {
      console.log("Skipping fetchFileMetadata - already loading");
      return;
    }
    
    try {
      console.log("Mengambil metadata file untuk agent:", agentId);
      
      // Tampilkan loading state
      const loadingToast = toast.loading("Mengambil data file...");
      setIsLoadingFiles(true);
      setHasAttemptedFileLoad(true);
      
      try {
        // Buat controller untuk timeout
        const controller = new AbortController();
        const signal = controller.signal;
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 detik timeout
        
        // Pertama, ambil file dari database Supabase
        const { data: filesFromDB, error } = await supabase
          .from('files')
            .select('*')
          .eq('agent_id', agentId);
        
        if (error) {
          console.error("Error database saat mengambil file:", error);
          throw error;
        }
        
        // Dapatkan server URL dari device yang terhubung ke agen
        let serverUrl = API_SERVER_URL; // Default URL sebagai fallback
        
        if (devices && devices.length > 0) {
          // Cari device aktif yang terhubung ke agen ini
          const connectedDevice = devices.find(d => d.ai_agent_id === agentId && d.status === "active");
          
          // Jika ada device terhubung, gunakan server-nya
          if (connectedDevice) {
            // Dapatkan informasi lengkap device dari database
            const { data: deviceData } = await supabase
              .from('connections')
              .select('server')
              .eq('id', connectedDevice.id)
              .single();
              
            if (deviceData && deviceData.server) {
              serverUrl = deviceData.server;
              console.log(`Menggunakan server dari device terhubung: ${serverUrl}`);
            }
          }
        }
        
        // Kedua, ambil metadata file dari server dengan endpoint baru
        const serverResponse = await fetch(`${serverUrl}/api/files-list?agentId=${agentId}`, {
          signal,
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        
        // Batalkan timeout
        clearTimeout(timeoutId);
        
        if (!serverResponse.ok) {
          console.error("Error saat mengambil file dari server:", serverResponse.statusText);
          // Fallback ke data dari database saja
          if (filesFromDB) {
            const formattedFiles = filesFromDB.map(file => {
              // Tambahkan type assertion untuk mengakses properti yang tidak ada di tipe
              const fileRecord = file as FileRecord;
              return {
                id: fileRecord.id,
                filename: fileRecord.filename,
                size: fileRecord.size,
                type: fileRecord.mimetype,
                uploaded_at: fileRecord.created_at,
                path: fileRecord.file_path,
                original_filename: fileRecord.original_filename || fileRecord.filename,
              };
            });
            
            setUploadedFiles(formattedFiles);
          }
          
          toast.error("Gagal mengambil informasi file dari server");
          return;
        }
        
        // Parse respon server
        const serverData = await serverResponse.json();
        console.log("Data file dari server:", serverData);
        
        if (serverData.files) {
          // Konversi data server ke format yang sesuai dengan state
          const filesWithStatus = serverData.files.map(file => {
            // Periksa apakah file ada di database
            const dbFile = filesFromDB?.find(db => db.filename === file.name) as FileRecord | undefined;
            
            return {
              id: dbFile?.id || `server-${file.name}`,
              filename: file.name,
              size: file.size,
              type: dbFile?.mimetype || getFileTypeFromName(file.name),
              uploaded_at: file.created || dbFile?.created_at || new Date().toISOString(),
              path: file.path,
              original_filename: file.original_filename || file.name,
              exists: true, // File fisik ada di server
              last_modified: file.modified,
              status: dbFile?.status || "pending"
            };
          });
          
          // Update state dengan data yang lebih lengkap
          setUploadedFiles(filesWithStatus);
          
          // Simpan ke localStorage
          if (agentId) {
            localStorage.setItem(FILES_STORAGE_KEY + agentId, JSON.stringify(filesWithStatus));
          }
          
          console.log(`${filesWithStatus.length} file ditemukan untuk agent ${agentId}`);
        } else {
          // Jika endpoint baru gagal, fallback ke data dari database
          console.warn("Endpoint agent-files tidak mengembalikan data yang valid");
          if (filesFromDB) {
            const formattedFiles = filesFromDB.map(file => {
              // Tambahkan type assertion untuk mengakses properti yang tidak ada di tipe
              const fileRecord = file as FileRecord;
              return {
                id: fileRecord.id,
                filename: fileRecord.filename,
                size: fileRecord.size,
                type: fileRecord.mimetype,
                uploaded_at: fileRecord.created_at,
                path: fileRecord.file_path,
                original_filename: fileRecord.original_filename || fileRecord.filename,
              };
            });
            
            setUploadedFiles(formattedFiles);
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.error('Request timeout saat mengambil file metadata');
          setFileLoadError('Timeout saat mengambil metadata file');
          toast.error('Timeout saat mengambil data file');
          } else {
          console.error('Error fetching file metadata:', error);
          setFileLoadError('Gagal memuat metadata file');
          toast.error('Gagal memuat data file');
        }
      } finally {
        // Hapus loading toast
        toast.dismiss(loadingToast);
        setIsLoadingFiles(false);
      }
    } catch (error) {
      console.error('Error fetching file metadata:', error);
      setFileLoadError('Gagal memuat metadata file');
      toast.error('Gagal memuat data file');
      setIsLoadingFiles(false);
    }
  };

  // Fungsi untuk mengambil data file dari server dokumen
  const fetchDocumentFiles = async () => {
    if (!agentId) {
      console.log("Tidak dapat mengambil file, agent ID tidak tersedia");
      return;
    }
    
    let loadingToast: string | number | null = null;
    
    try {
      // Tampilkan indikator loading
      loadingToast = toast.loading("Mengambil data dokumen...");
      
      // Panggil API dokumen
      const response = await fetch(`${DOCUMENT_API_URL}/files`, {
        method: 'GET',
        headers: {
          'agent-id': agentId
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gagal mengambil data dokumen:", errorText);
        toast.error("Gagal mengambil data dokumen");
        return;
      }
      
      const data = await response.json();
      console.log("Data dokumen:", data);
      
      if (data.success && data.files) {
        // Perbarui state file
        const formattedFiles = data.files.map(file => ({
          id: file.id.toString(),
          filename: file.original_filename,
          size: file.size,
          type: file.mimetype,
          uploaded_at: file.created_at,
          path: file.file_path,
          original_filename: file.original_filename,
          status: "ready" // Override status menjadi 'ready' untuk semua file
        }));
        
        setUploadedFiles(formattedFiles);
        
        // Simpan ke localStorage
        if (agentId) {
          localStorage.setItem(FILES_STORAGE_KEY + agentId, JSON.stringify(formattedFiles));
        }
        
        // Tidak perlu menampilkan notifikasi sukses
      } else if (!data.success) {
        // Hanya tampilkan toast error jika API mengembalikan success: false
        toast.error(data.message || "Gagal mengambil data dokumen");
        }
      } catch (error) {
      console.error("Error mengambil data dokumen:", error);
      toast.error("Gagal mengambil data dokumen: " + (error instanceof Error ? error.message : "Unknown error"));
      } finally {
      // Tutup indikator loading
      if (loadingToast) {
        toast.dismiss(loadingToast);
      }
    }
  };
  
  // Panggil getFileInfo dan fetchFileMetadata saat tab knowledge diaktifkan
  useEffect(() => {
    if (activeTab === "knowledge" && agentId && userId) {
      // Cek apakah data file sudah diambil sebelumnya atau sedang dalam proses
      if (!hasAttemptedFileLoad && !isLoadingFiles) {
        console.log("Tab knowledge aktif, memulai pengambilan data file");
        // getFileInfo().catch(console.error); // Dinonaktifkan karena server tidak tersedia
        fetchDocumentFiles().catch(console.error);
      }
    }
  }, [activeTab, agentId, userId, hasAttemptedFileLoad, isLoadingFiles]);

  // Reset file load error saat tab berubah
  useEffect(() => {
    if (activeTab !== "knowledge") {
      // Reset error state jika berpindah dari tab knowledge
      setFileLoadError(null);
    }
  }, [activeTab]);

  const handleSaveSettings = async () => {
    if (!agent) return;
    
    setIsSaving(true);
    
    try {
      // Update agent in database
      const { error } = await supabase
        .from('ai_agents')
        .update({
          name: agent.name,
          description: agent.description,
          type: agent.type,
          status: agent.status,
          settings: agent.settings
        })
        .eq('id', agent.id);
      
      if (error) throw error;

      // Get all active devices for this agent
      const activeDevices = devices.filter(d => d.status === "active" && d.ai_agent_id === agent.id);

      // Call refreshconnection for each active device
      for (const device of activeDevices) {
        try {
          // Get the device's server and api_key
          const { data: connectionData } = await supabase
            .from('connections')
            .select('server, api_key')
            .eq('id', device.id)
            .single();

          if (connectionData?.server && connectionData?.api_key) {
            console.log(`[Agent] Memanggil API refresh connection untuk device ${device.id} di server: ${connectionData.server}`);

            const refreshResponse = await fetch(`${connectionData.server}/api/connections/refresh`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${connectionData.api_key}`,
                'connection_id': device.id
              }
            });

            const refreshData = await refreshResponse.json();
            if (refreshResponse.ok && refreshData.success) {
              console.log(`[Agent] Refresh connection berhasil untuk device ${device.id}:`, refreshData);
            } else {
              console.warn(`[Agent] Refresh connection tidak berhasil untuk device ${device.id}:`, refreshData);
            }
          }
        } catch (refreshError) {
          console.error(`[Agent] Error saat memanggil refresh connection untuk device ${device.id}:`, refreshError);
          // Don't show error toast as this is a background operation
        }
      }
      
      toast.success("Pengaturan berhasil disimpan");

      // Kirim knowledge custom ke endpoint ADD_AGENT_KNOWLEDGE
      try {
        const ADD_AGENT_KNOWLEDGE_URL = import.meta.env.VITE_ADD_AGENT_KNOWLEDGE || 'http://localhost:5678/webhook-test/add_knowledge_text';
        // Ambil knowledge custom dari agent.settings
        let knowledgeText = '';
        if (agent.settings && agent.settings.knowledge) {
          if (typeof agent.settings.knowledge === 'string') {
            knowledgeText = agent.settings.knowledge;
          } else if (typeof agent.settings.knowledge === 'object' && agent.settings.knowledge.custom_data) {
            knowledgeText = agent.settings.knowledge.custom_data;
          }
        }
        if (knowledgeText && agent.id) {
          const response = await fetch(ADD_AGENT_KNOWLEDGE_URL, {
            method: 'POST',
            headers: {
              'agent-id': agent.id,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ Knowledge_text: knowledgeText }),
          });
          if (!response.ok) {
            toast.error('Gagal mengirim knowledge ke server');
          } else {
            toast.success('Knowledge berhasil dikirim ke server');
          }
        }
      } catch (err) {
        console.error('Error saat mengirim knowledge:', err);
        toast.error('Gagal mengirim knowledge ke server');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Gagal menyimpan pengaturan');
    } finally {
      setIsSaving(false);
    }
  };

  const updateAgentSetting = (section: string, field: string, value: any) => {
    if (!agent) return;

    setAgent({
      ...agent,
      settings: {
        ...agent.settings,
        [section]: section === 'behaviour' || section === 'knowledge'
          ? value
          : {
              ...agent.settings[section as keyof typeof agent.settings],
              [field]: value
            }
      }
    });
  };

  const toggleDeviceStatus = async (id: string) => {
    // Find device and toggle status
    const device = devices.find(d => d.id === id);
    if (!device) return;
    
    // Jika device dinonaktifkan oleh agen lain, jangan izinkan untuk mengaktifkannya
    if (device.disabled) {
      toast.error(`${device.name} sedang digunakan oleh agen lain`);
      return;
    }
    
    const newStatus = device.status === "active" ? "inactive" : "active";
    const isConnected = newStatus === "active";
    
    try {
      // Jika akan diaktifkan, periksa dulu apakah sudah dipakai agen lain
      if (isConnected) {
        const { data: currentStatus } = await supabase
          .from('connections')
          .select('ai_agent_id')
          .eq('id', id)
          .single();
        
        // Jika sudah dipakai agen lain, batalkan
        if (currentStatus && currentStatus.ai_agent_id && currentStatus.ai_agent_id !== agentId) {
          toast.error(`${device.name} telah diaktifkan oleh agen lain`);
          
          // Refresh devices untuk memperbarui status
          const { data: currentUser } = await supabase.auth.getUser();
          if (currentUser && currentUser.user) {
            const { data: refreshedConnections } = await supabase
              .from('connections')
              .select('*')
              .eq('user_id', currentUser.user.id);
            
            if (refreshedConnections) {
              // Ambil kembali daftar connections yang sudah digunakan oleh agen lain
              const { data: usedConnectionsData } = await supabase
                .from('connections')
                .select('id, ai_agent_id')
                .not('ai_agent_id', 'is', null)
                .neq('ai_agent_id', agentId || '');
              
              // Buat map untuk mempermudah lookup
              const usedConnectionsMap = new Map();
              if (usedConnectionsData) {
                usedConnectionsData.forEach(conn => {
                  usedConnectionsMap.set(conn.id, conn.ai_agent_id);
                });
              }
              
              setDevices(refreshedConnections.map(connection => {
                // Cek apakah connection ini digunakan oleh current agent
                const isUsedByCurrentAgent = connection.ai_agent_id === agentId;
                
                // Cek apakah digunakan oleh agen lain
                const isUsedByOtherAgent = !isUsedByCurrentAgent && usedConnectionsMap.has(connection.id);
                
                return {
                  id: connection.id,
                  name: connection.name,
                  // Status active jika digunakan oleh agen ini (tidak bergantung pada connected)
                  status: (isUsedByCurrentAgent) ? "active" : "inactive",
                  type: connection.phone_number || "WhatsApp",
                  last_active: connection.updated_at || connection.created_at,
                  ai_agent_id: connection.ai_agent_id,
                  // Device disabled jika digunakan oleh agen lain
                  disabled: isUsedByOtherAgent
                };
              }));
            }
          }
          
          return;
        }
      }
      
      // Update HANYA ai_agent_id di database, TIDAK mengubah kolom connected
      const updateData: any = { };
      
      // Jika diaktifkan, tetapkan ai_agent_id ke id agen saat ini
      // Jika dinonaktifkan, hapus ai_agent_id hanya jika milik agen saat ini
      if (isConnected) {
        updateData.ai_agent_id = agentId;
      } else if (device.ai_agent_id === agentId) {
        updateData.ai_agent_id = null;
      }
      
      const { error } = await supabase
        .from('connections')
        .update(updateData)
        .eq('id', id);
      
      if (error) throw error;
      
      // Update local state
      setDevices(devices.map(d => 
        d.id === id ? { 
          ...d, 
          status: newStatus, 
          ai_agent_id: isConnected ? agentId : (d.ai_agent_id === agentId ? null : d.ai_agent_id)
        } : d
      ));
      
      toast.success(`${device.name} ${newStatus === "active" ? "diaktifkan" : "dinonaktifkan"}`);
      
      // Dapatkan server URL dan informasi lain dari koneksi untuk memanggil API /api/refreshconnection
      try {
        // Ambil data terbaru dari connection termasuk informasi server
        const { data: connectionData } = await supabase
          .from('connections')
          .select('server, api_key')
          .eq('id', id)
          .single();
          
        if (connectionData && connectionData.server && agentId) {
          console.log(`[Agent] Memanggil API refresh connection di server: ${connectionData.server}`);
          
          // Panggil API /api/refreshconnection dengan parameter agent_id
          const refreshResponse = await fetch(`${connectionData.server}/api/connections/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${connectionData.api_key}`,
              'connection_id': device.id
            }
          });
          
          const refreshData = await refreshResponse.json();
          
          if (refreshResponse.ok && refreshData.success) {
            console.log('[Agent] Refresh connection berhasil:', refreshData);
          } else {
            console.warn('[Agent] Refresh connection tidak berhasil:', refreshData);
          }
        } else {
          console.warn('[Agent] Tidak dapat memanggil refresh connection: data connection tidak lengkap');
        }
      } catch (refreshError) {
        console.error('[Agent] Error saat memanggil refresh connection:', refreshError);
        // Tidak perlu menampilkan toast error karena ini adalah operasi background
      }
    } catch (error) {
      console.error('Error toggling device status:', error);
      toast.error('Gagal mengubah status device');
    }
  };

  // Fungsi untuk menentukan tipe file dari nama file
  const getFileTypeFromName = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return 'application/pdf';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'txt':
        return 'text/plain';
      case 'csv':
        return 'text/csv';
      case 'json':
        return 'application/json';
      case 'epub':
        return 'application/epub+zip';
      default:
        return 'application/octet-stream';
    }
  };

  // Fungsi untuk mendapatkan icon berdasarkan tipe file
  const getFileIcon = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return <FileText className="h-4 w-4 text-red-500" />;
      case 'docx':
        return <FileText className="h-4 w-4 text-blue-500" />;
      case 'txt':
        return <FileText className="h-4 w-4 text-gray-500" />;
      case 'csv':
        return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
      case 'json':
        return <FileText className="h-4 w-4 text-orange-500" />;
      case 'epub':
        return <FileText className="h-4 w-4 text-purple-500" />;
      default:
        return <File className="h-4 w-4 text-gray-500" />;
    }
  };

  // Fungsi untuk format ukuran file
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Tambahkan fungsi khusus untuk memeriksa batasan file
  const checkFileLimit = async (numNewFiles: number): Promise<boolean> => {
    if (!agentId) return false;
    
    try {
      // Selalu ambil data terbaru dari Supabase
      const { data: currentFiles, error } = await supabase
        .from('files')
        .select('id')
        .eq('agent_id', agentId);
        
      if (error) {
        console.error("Error memeriksa jumlah file dari database:", error);
        // Fallback menggunakan state lokal
        return (uploadedFiles.length + numNewFiles) <= MAX_FILES_PER_AGENT;
      }
      
      // Cek apakah total file akan melebihi batas
      const currentCount = currentFiles?.length || 0;
      console.log(`File count check - DB: ${currentCount}, New: ${numNewFiles}, Max: ${MAX_FILES_PER_AGENT}`);
      
      return (currentCount + numNewFiles) <= MAX_FILES_PER_AGENT;
    } catch (err) {
      console.error("Error checking file limit:", err);
      // Fallback menggunakan state lokal jika terjadi error
      return (uploadedFiles.length + numNewFiles) <= MAX_FILES_PER_AGENT;
    }
  };

  // Fungsi untuk validasi file
  const validateFile = (file: File): { valid: boolean; message?: string } => {
    // Validasi tipe file
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !VALID_EXTENSIONS.includes(extension)) {
      return { 
        valid: false, 
        message: `Format file ${file.name} tidak didukung. Format yang didukung: CSV, DOCX, JSON, PDF, TXT, EPUB` 
      };
    }
    
    // Validasi ukuran file
    const maxSizeBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return { 
        valid: false, 
        message: `File ${file.name} terlalu besar. Ukuran maksimal adalah ${MAX_FILE_SIZE_MB}MB` 
      };
    }
    
    return { valid: true };
  };

  // Fungsi untuk mencoba ulang upload file dengan jumlah upaya yang dibatasi
  const retryUpload = async (file: File, retryCount = 0, maxRetries = 3) => {
    /*
    // Fungsi dinonaktifkan karena API_BASE_URL tidak dapat dijangkau
    if (retryCount >= maxRetries) {
      console.error(`Menyerah setelah ${maxRetries} percobaan`);
      throw new Error(`Gagal mengunggah file ${file.name} setelah ${maxRetries} percobaan`);
    }
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Pastikan format nama file selalu menggunakan agentId_namaFile.ext
      const customFileName = `${agentId}_${file.name}`;
      formData.append('customFileName', customFileName);
          
      formData.append('agentId', agentId);
          
      console.log(`Mencoba upload file: ${file.name}`);
      console.log(`Nama file yang akan disimpan: ${customFileName}`);
      
      // Upload file ke server API
          const response = await fetch(`${API_SERVER_URL}/api/upload`, {
            method: 'POST',
            body: formData,
          });
          
          if (!response.ok) {
        let errorMsg = 'Upload gagal';
        try {
            const errorData = await response.json();
          errorMsg = errorData.message || errorMsg;
        } catch (e) {
          // Jika respons tidak bisa di-parse sebagai JSON, gunakan errorMsg default
          console.error('Error parsing error response:', e);
        }
        throw new Error(errorMsg);
      }
      
      let result;
      try {
        result = await response.json();
      } catch (e) {
        console.error('Error parsing response as JSON:', e);
        throw new Error('Format respons server tidak valid');
      }
      
      return result;
    } catch (error) {
      console.error(`Upload attempt ${retryCount + 1} failed:`, error);
      // Tunggu sebentar sebelum retry
      await new Promise(resolve => setTimeout(resolve, 1500));
      // Retry dengan counter ditambah
      return retryUpload(file, retryCount + 1, maxRetries);
    }
    */
  };

  // Tambahkan fungsi untuk mengunggah file ke API dokumen
  const uploadToDocumentAPI = async (file: File) => {
    if (!agentId || !userId) {
      throw new Error("ID Agen atau User ID tidak tersedia");
    }
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("agent_id", agentId);
    formData.append("user_id", userId);
    
    const response = await fetch(`${DOCUMENT_API_URL}/upload`, {
      method: "POST",
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Gagal mengunggah file");
    }
    
    const result = await response.json();
    return result;
  };

  const handleFileUpload = async (files: File[]) => {
    if (!files || files.length === 0) {
      return;
    }
    
    if (!agentId) {
      toast.error('ID Agen tidak ditemukan');
      return;
    }
    
    if (!userId) {
      toast.error('User ID tidak ditemukan, silakan refresh halaman');
      return;
    }
    
    console.log("Mencoba upload file:", files.map(f => f.name));
    
    // Cek batas jumlah file
    const canUpload = await checkFileLimit(files.length);
    if (!canUpload) {
      toast.error(`Tidak dapat mengunggah file. Maksimal ${MAX_FILES_PER_AGENT} file diizinkan.`);
      return;
    }
    
    // Variabel untuk melacak status pengunggahan
    let uploadedCount = 0;
    let failedCount = 0;
    let uploadedFilesList = [];

    // Tampilkan loading state
    const loadingToast = toast.loading(`Mengunggah file...`);
    
    try {
      // Loop melalui semua file yang akan diunggah
      for (const file of files) {
        try {
          // Validasi file (size dan type)
          const validation = validateFile(file);
          if (!validation.valid) {
            toast.error(validation.message || `File ${file.name} tidak valid`);
            failedCount++;
            continue;
          }
          
          // Upload file ke API dokumen
          const uploadResult = await uploadToDocumentAPI(file);
          
          if (uploadResult.success) {
            uploadedCount++;
            
            // Tambahkan file ke daftar yang berhasil diunggah
            const newFile = {
              id: uploadResult.file.id || `temp-${Date.now()}`,
              filename: uploadResult.file.filename,
              size: uploadResult.file.size,
              type: uploadResult.file.mimetype,
              uploaded_at: new Date().toISOString(),
              path: uploadResult.file.path || "",
              original_filename: uploadResult.file.originalName,
              status: "ready"
            };
            
            uploadedFilesList.push(newFile);
            
            console.log(`File ${file.name} berhasil diunggah`);
          } else {
            failedCount++;
            console.error(`Gagal mengunggah file ${file.name}:`, uploadResult.message);
          }
        } catch (error) {
          console.error(`Error uploading file ${file.name}:`, error);
          failedCount++;
        }
      }
      
      // Bersihkan loading state
      toast.dismiss(loadingToast);
      
      // Tampilkan pesan hanya jika ada kegagalan
      if (uploadedCount > 0) {
        // Hanya tampilkan pesan error jika ada file yang gagal
        if (failedCount > 0) {
          toast.error(`${failedCount} file gagal diunggah`);
        }
        
        // Reset komponen FileUpload
        if (document.querySelector('input[type="file"]')) {
          (document.querySelector('input[type="file"]') as HTMLInputElement).value = '';
        }
        
        // Update state dengan file baru
        setUploadedFiles(prevFiles => {
          const newFiles = [...prevFiles, ...uploadedFilesList];
          if (agentId) {
            localStorage.setItem(FILES_STORAGE_KEY + agentId, JSON.stringify(newFiles));
          }
          return newFiles;
        });
        
        // Muat ulang data file
        setTimeout(() => {
          fetchDocumentFiles();
        }, 1000);
      } else if (failedCount > 0) {
        toast.error(`Semua file (${failedCount}) gagal diunggah`);
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      toast.dismiss(loadingToast);
      toast.error('Gagal mengunggah file: ' + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  // Fungsi untuk menghapus file dari API dokumen
  const deleteFromDocumentAPI = async (fileId: string) => {
    const response = await fetch(`${DOCUMENT_API_URL}/files`, {
      method: 'DELETE',
        headers: {
        'file-id': fileId
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Gagal menghapus file');
    }
    
    const result = await response.json();
    return result;
  };

  const handleDeleteFile = async (fileId: string, filename: string, filePath: string) => {
    if (!agentId || !userId) return;
    
    // Gunakan nama file dari metadata di database
    const fileData = uploadedFiles.find(f => f.id === fileId);
    const displayName = fileData?.original_filename || filename;
    
    // Tampilkan konfirmasi delete dengan nama file asli
    if (!confirm(`Apakah Anda yakin ingin menghapus file "${displayName}"?`)) {
      return;
    }
    
    // Tampilkan loading state
    const deleteToast = toast.loading(`Menghapus file ${displayName}...`);
    
    try {
      console.log("Mencoba menghapus file dengan ID:", fileId);
      console.log("Nama file:", filename);
      console.log("Nama file untuk tampilan:", displayName);
      
      // Hapus file menggunakan API dokumen
      const deleteResult = await deleteFromDocumentAPI(fileId);
      
      if (deleteResult.success) {
      // Hapus file dari state
      const updatedFiles = uploadedFiles.filter(file => file.id !== fileId);
      
      // Update state
      setUploadedFiles(updatedFiles);
      
      // Update localStorage
      if (agentId) {
        localStorage.setItem(FILES_STORAGE_KEY + agentId, JSON.stringify(updatedFiles));
        console.log("Local storage diperbarui, jumlah file:", updatedFiles.length);
      }
      
        toast.success(`File ${displayName} berhasil dihapus`);
      } else {
        toast.error(`Gagal menghapus file ${displayName}: ${deleteResult.message}`);
      }
    } catch (error: any) {
      console.error('Error deleting file:', error);
      toast.error('Gagal menghapus file: ' + (error.message || 'Unknown error'));
    } finally {
      // Bersihkan toast loading
      toast.dismiss(deleteToast);
      
      // Refresh data file
      fetchDocumentFiles();
    }
  };

  // Perbaikan fungsi handleDownloadFile
  const handleDownloadFile = async (file: UploadedFile) => {
    try {
      console.log('Download request for file:', file.id);
      console.log('Original filename:', file.original_filename || file.filename);
      
      // Tampilkan loading toast
      const loadingToast = toast.loading(`Mempersiapkan download...`);
      
      // Buat URL download dengan file ID sebagai query parameter
      const downloadUrl = `${DOCUMENT_API_URL}/download`;
      
      // Membuat link elemen untuk download
      const link = document.createElement('a');
      link.href = downloadUrl;
      
      // Buat blob dari response
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'file-id': file.id
        }
      });
      
      if (!response.ok) {
        throw new Error(`Download gagal: ${response.status} ${response.statusText}`);
      }
      
      // Dapatkan nama file dari header Content-Disposition jika ada
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = file.original_filename || file.filename;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }
      
      // Buat blob dari response
      const blob = await response.blob();
      
      // Buat object URL dari blob
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Set atribut link
      link.href = blobUrl;
      link.download = filename;
      
      // Tutup loading toast
      toast.dismiss(loadingToast);
      
      // Klik link untuk memulai download
      document.body.appendChild(link);
      link.click();
      
      // Hapus link setelah digunakan
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      
      // Tampilkan notifikasi sukses
      toast.success(`Mengunduh file ${filename}`);
      
      // Log download action
      console.log(`File download initiated: ${filename} (ID: ${file.id})`);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Gagal mengunduh file: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // Fungsi untuk menyegarkan data file secara manual
  const refreshFileData = () => {
    setFileLoadError(null);
    setHasAttemptedFileLoad(false);
    setUploadedFiles([]);
    // Jalankan fungsi getFileInfo dan fetchDocumentFiles secara berurutan
    // getFileInfo()  // Dinonaktifkan karena server tidak tersedia
    //   .catch(console.error)
    //   .finally(() => {
    //     // Setelah getFileInfo selesai, jalankan fetchDocumentFiles
    //     fetchDocumentFiles().catch(console.error);
    //   });
    
    // Langsung panggil fetchDocumentFiles saja
    fetchDocumentFiles().catch(console.error);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[70vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent"></div>
        <p className="ml-3">Memuat data agen...</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="space-y-4">
        <Button 
          variant="outline" 
          onClick={() => navigate("/dashboard/ai-agents")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Kembali ke Daftar Agen
        </Button>
        <div className="text-center py-12">
          <h2 className="text-xl font-medium">Agen tidak ditemukan</h2>
          <p className="text-muted-foreground mt-2">
            Agen dengan ID {agentId} tidak ditemukan atau telah dihapus.
          </p>
          <Button 
            className="mt-6"
            onClick={() => {
              // Coba muat ulang
              window.location.reload();
            }}
          >
            Muat Ulang
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <Button 
            variant="outline" 
            onClick={() => navigate("/dashboard/ai-agents")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{agent.name}</h1>
            <p className="text-muted-foreground">{agent.description}</p>
          </div>
        </div>
        <Button
          onClick={handleSaveSettings}
          disabled={isSaving}
        >
          {isSaving ? "Menyimpan..." : "Simpan Pengaturan"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full md:w-[500px] grid-cols-4">
          <TabsTrigger value="integration" className="flex items-center gap-2">
            <Link className="h-4 w-4" />
            Integrasi
          </TabsTrigger>
          <TabsTrigger value="behaviour" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Behaviour
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Knowledge
          </TabsTrigger>
          <TabsTrigger value="more_settings" className="flex items-center gap-2">
            <SettingsIcon className="h-6 w-6" />
            More Setting
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="integration">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Daftar Device</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {devices.map((device) => (
                      <div 
                        key={device.id} 
                        className={`flex items-center justify-between p-3 border rounded-md ${device.disabled ? 'opacity-50' : ''}`}
                      >
                        <div>
                          <h3 className="text-base font-medium">{device.name}</h3>
                          <p className="text-sm text-muted-foreground">{device.type}</p>
                          {device.ai_agent_id && (
                            <p className="text-xs text-blue-500">ID Agen: {device.ai_agent_id}</p>
                          )}
                          {device.disabled && (
                            <p className="text-xs text-red-500">Digunakan oleh agen lain</p>
                          )}
                        </div>
                        <div className="flex items-center">
                          <span className="text-sm text-muted-foreground mr-2">
                            {device.status === "active" ? "ON" : "OFF"}
                          </span>
                          <Switch 
                            checked={device.status === "active"}
                            onCheckedChange={() => toggleDeviceStatus(device.id)}
                            disabled={device.disabled}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="behaviour">
            <Card>
              <CardHeader>
                <CardTitle>Perilaku Agen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="agent-behaviour">Konfigurasi Perilaku</Label>
                    <Textarea 
                      id="agent-behaviour" 
                      placeholder="Masukkan instruksi perilaku agen AI Anda di sini..." 
                      value={typeof agent.settings.behaviour === 'string' ? agent.settings.behaviour : ''}
                      onChange={e => updateAgentSetting('behaviour', '', e.target.value)}
                      className="min-h-[300px]"
                    />
                    <p className="text-sm text-muted-foreground">
                      Tentukan perilaku, nada, dan gaya komunikasi agen saat berinteraksi dengan pengguna
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="knowledge">
              <Card>
                <CardHeader>
                  <CardTitle>Basis Pengetahuan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="file-upload" className="block mb-2">Unggah Dokumen</Label>
                    <FileUpload 
                      onFileUpload={handleFileUpload}
                      multiple={true}
                      maxFiles={MAX_FILES_PER_AGENT}
                      acceptedFileTypes={ACCEPTED_FILE_TYPES}
                      maxSizeMB={MAX_FILE_SIZE_MB}
                      formatDisplayText="Format: CSV, DOCX, JSON, PDF, TXT, EPUB"
                    />

                    {/* Daftar File yang Sudah Diunggah */}
                    <div className="mt-8">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-base font-medium">
                        Dokumen yang Tersedia 
                        <span className="text-sm ml-2 text-muted-foreground">
                            ({uploadedFiles.length}/{MAX_FILES_PER_AGENT} file)
                        </span>
                      </h3>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            disabled={isLoadingFiles}
                            onClick={refreshFileData}
                          >
                            {isLoadingFiles ? (
                              <span className="flex items-center">
                                <div className="animate-spin h-4 w-4 mr-1 border-2 border-primary border-t-transparent rounded-full"></div>
                                Memuat...
                              </span>
                            ) : (
                              <span className="flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                                Segarkan
                              </span>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isLoadingFiles}
                            onClick={() => fetchDocumentFiles().catch(console.error)}
                          >
                            <span className="flex items-center">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              Dokumen API
                            </span>
                          </Button>
                        </div>
                      </div>
                      
                      {isLoadingFiles ? (
                        <div className="text-center py-8 border rounded-md">
                          <div className="animate-spin rounded-full h-6 w-6 border-4 border-primary border-t-transparent mx-auto mb-2"></div>
                          <p className="text-muted-foreground">Sedang memuat data file...</p>
                        </div>
                      ) : fileLoadError ? (
                        <div className="text-center py-8 border rounded-md">
                          <p className="text-red-500">{fileLoadError}</p>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="mt-2"
                            onClick={refreshFileData}
                          >
                            Coba Lagi
                          </Button>
                        </div>
                      ) : uploadedFiles.length === 0 ? (
                        <div className="text-center py-8 border rounded-md">
                          <p className="text-muted-foreground">Belum ada dokumen yang diunggah</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {uploadedFiles.map((file) => {
                            // Gunakan original_filename untuk tampilan
                            const displayName = file.original_filename || 
                              (file.filename.startsWith(`${agentId}_`) ? 
                              file.filename.substring(`${agentId}_`.length) : 
                              file.filename);
                            
                            // Status file
                            const fileStatus = file.status || "pending";
                            const isPending = fileStatus === "pending";
                            
                            // Pastikan apakah file memiliki status keberadaan
                            const hasExistsStatus = 'exists' in file;
                            const fileExists = hasExistsStatus ? file.exists : true;
                            
                            return (
                            <div 
                              key={file.id} 
                              className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/30 transition-colors"
                            >
                              <div className="flex items-center space-x-3">
                                  {getFileIcon(displayName)}
                                <div>
                                    <div className="flex items-center">
                                      <p className="text-sm font-medium">{displayName}</p>
                                      <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs ${isPending ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                        {isPending ? 'Pending' : 'Ready'}
                                      </span>
                                      {hasExistsStatus && !fileExists && (
                                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-red-100 text-red-800">
                                          File Tidak Tersedia
                                        </span>
                                      )}
                                    </div>
                                  <p className="text-xs text-muted-foreground">
                                    {formatFileSize(file.size)} • {new Date(file.uploaded_at).toLocaleDateString('id-ID')}
                                  </p>
                                </div>
                              </div>
                              <div className="flex space-x-2">
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                    onClick={() => handleDownloadFile(file)}
                                  title="Download"
                                    disabled={hasExistsStatus && !fileExists}
                                >
                                  <Download className="h-4 w-4 text-muted-foreground" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => handleDeleteFile(file.id, file.filename, file.path)}
                                  title="Hapus"
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    
                    <Label htmlFor="knowledge-base" className="block mt-8 mb-2">Pengetahuan Kustom</Label>
                    <Textarea 
                      id="knowledge-base" 
                      placeholder="Masukkan informasi yang ingin diketahui oleh agen AI..." 
                      className="min-h-[300px]"
                      value={typeof agent.settings.knowledge === 'string' ? agent.settings.knowledge : ''}
                      onChange={e => updateAgentSetting('knowledge', '', e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">
                      Informasi yang ditambahkan di sini akan menjadi pengetahuan dasar agen Anda
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="more_settings">
              <Card>
                <CardHeader>
                  <CardTitle>Pengaturan Tambahan</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between py-3 border-b">
                      <div>
                        <h3 className="text-base font-medium">Humanlike Behaviour (Typing, Online, etc)</h3>
                      </div>
                      <div>
                        <Switch 
                          defaultChecked={agent?.settings?.more_settings?.humanlike_behaviour ?? true}
                          onCheckedChange={(checked) => {
                            if (!agent) return;
                            
                            const updatedSettings = {
                              ...agent.settings
                            };
                            
                            if (!updatedSettings.more_settings) {
                              updatedSettings.more_settings = {
                                humanlike_behaviour: true,
                                multi_bubble_chat: false,
                                stop_ai_if_cs_replied: true
                              };
                            }
                            
                            updatedSettings.more_settings.humanlike_behaviour = checked;
                            
                            setAgent({
                              ...agent,
                              settings: updatedSettings
                            });
                          }}
                        />
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between py-3 border-b">
                      <div>
                        <h3 className="text-base font-medium">Multi-Bubble Chat Reply (Beta)</h3>
                      </div>
                      <div>
                        <Switch 
                          defaultChecked={agent?.settings?.more_settings?.multi_bubble_chat ?? false}
                          onCheckedChange={(checked) => {
                            if (!agent) return;
                            const updatedSettings = {
                              ...agent.settings
                            };
                            if (!updatedSettings.more_settings) {
                              updatedSettings.more_settings = {
                                humanlike_behaviour: true,
                                multi_bubble_chat: false,
                                stop_ai_if_cs_replied: true
                              };
                            }
                            updatedSettings.more_settings.multi_bubble_chat = checked;
                            setAgent({
                              ...agent,
                              settings: updatedSettings
                            });
                          }}
                        />
                      </div>
                    </div>
                    {/* Tambahan: Read Receipts */}
                    <div className="flex items-center justify-between py-3 border-b">
                      <div>
                        <h3 className="text-base font-medium">Read Receipts</h3>
                      </div>
                      <div>
                        <Switch
                          checked={agent?.settings?.more_settings?.read_receipts ?? false}
                          onCheckedChange={(checked) => {
                            if (!agent) return;
                            const updatedSettings = {
                              ...agent.settings
                            };
                            if (!updatedSettings.more_settings) {
                              updatedSettings.more_settings = {
                                humanlike_behaviour: true,
                                multi_bubble_chat: false,
                                stop_ai_if_cs_replied: true,
                                read_receipts: false
                              };
                            }
                            updatedSettings.more_settings.read_receipts = checked;
                            setAgent({
                              ...agent,
                              settings: updatedSettings
                            });
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-3">
                      <div>
                        <h3 className="text-base font-medium">Stop AI Reply if CS manual replied</h3>
                      </div>
                      <div>
                        <Switch 
                          defaultChecked={agent?.settings?.more_settings?.stop_ai_if_cs_replied ?? true}
                          onCheckedChange={(checked) => {
                            if (!agent) return;
                            const updatedSettings = {
                              ...agent.settings
                            };
                            if (!updatedSettings.more_settings) {
                              updatedSettings.more_settings = {
                                humanlike_behaviour: true,
                                multi_bubble_chat: false,
                                stop_ai_if_cs_replied: true
                              };
                            }
                            updatedSettings.more_settings.stop_ai_if_cs_replied = checked;
                            setAgent({
                              ...agent,
                              settings: updatedSettings
                            });
                          }}
                        />
                      </div>
                    </div>
                    {/* Tambahan: AI handle back after */}
                    <div className="flex items-center justify-between py-3">
                      <div>
                        <h3 className="text-base font-medium">Auto Back Handle AI After</h3>
                      </div>
                      <div className="flex items-center border rounded overflow-hidden">
                        <input
                          type="number"
                          min={1}
                          className="w-20 px-2 py-1 outline-none text-right bg-transparent border-none"
                          value={agent?.settings?.more_settings?.ai_handle_back_after_minutes ?? ''}
                          onChange={e => {
                            if (!agent) return;
                            const updatedSettings = {
                              ...agent.settings
                            };
                            if (!updatedSettings.more_settings) {
                              updatedSettings.more_settings = {
                                humanlike_behaviour: true,
                                multi_bubble_chat: false,
                                stop_ai_if_cs_replied: true
                              };
                            }
                            updatedSettings.more_settings.ai_handle_back_after_minutes = Number(e.target.value);
                            setAgent({
                              ...agent,
                              settings: updatedSettings
                            });
                          }}
                        />
                        <span className="px-2 text-muted-foreground">minutes</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    );
  };

export default AIAgentSettingsPage; 