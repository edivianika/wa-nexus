import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, PlusCircle, Trash2, Edit2, UploadCloud } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {CSS} from '@dnd-kit/utilities';
import { Smile, Bold, Italic } from "lucide-react";

interface DripMessageDraft {
  id?: string;
  message: string;
  type: string;
  delay: number;
  order: number;
  media_url?: string;
  caption?: string;
}

interface SubscriberDraft {
  contact_id: string;
}

const API_SERVER_URL = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:3000';
const API_URL = API_SERVER_URL + '/api';

const steps = [
  "Info Campaign",
  "Pesan Drip",
  "Subscriber",
  "Review & Submit"
];

const CampaignCreatePage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // Step 1: Info
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Step 2: Pesan Drip
  const [messages, setMessages] = useState<DripMessageDraft[]>([]);
  const [msgDraft, setMsgDraft] = useState<DripMessageDraft>({ message: "", type: "text", delay: 0, order: 1 });

  // Step 3: Subscriber
  const [subscribers, setSubscribers] = useState<SubscriberDraft[]>([]);
  const [subDraft, setSubDraft] = useState<SubscriberDraft>({ contact_id: "" });

  // Step 4: Loading & Error
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Stepper UI
  const renderStepper = () => (
    <div className="flex items-center justify-center gap-4 mb-8">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-white ${i <= step ? 'bg-primary' : 'bg-gray-300'}`}>{i + 1}</div>
          <span className={`text-sm ${i === step ? 'font-bold text-primary' : 'text-gray-500'}`}>{s}</span>
          {i < steps.length - 1 && <div className="w-8 h-1 bg-gray-300 rounded" />}
        </div>
      ))}
    </div>
  );

  // Step 1: Info Campaign
  const renderStep1 = () => (
    <Card className="max-w-xl mx-auto">
      <CardHeader>
        <CardTitle>Info Campaign</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Nama Campaign *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} required maxLength={100} />
        </div>
        <div>
          <Label>Deskripsi</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} maxLength={500} />
        </div>
        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft className="mr-2 w-4 h-4" />Back</Button>
          <Button onClick={() => {
            if (!name.trim()) return toast.error("Nama campaign wajib diisi");
            setStep(1);
          }}>Next</Button>
        </div>
      </CardContent>
    </Card>
  );

  // Step 2: Pesan Drip
  const sensors = useSensors(useSensor(PointerSensor));
  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = messages.findIndex((m) => m.order === active.id);
      const newIndex = messages.findIndex((m) => m.order === over.id);
      const newArr = arrayMove(messages, oldIndex, newIndex).map((m, i) => ({ ...m, order: i + 1 }));
      setMessages(newArr);
    }
  };
  const renderStep2 = () => (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Pesan Drip</h2>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={messages.map(m => m.order)} strategy={verticalListSortingStrategy}>
          {messages.length === 0 && <div className="text-center text-gray-400 py-8">Belum ada pesan drip</div>}
          {messages.map((msg, i) => {
            const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: msg.order });
            return (
              <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} key={msg.order}>
                <SortableDripCard
                  id={msg.order}
                  msg={msg}
                  onEdit={() => {
                    setMsgDraft(msg);
                    setMessages(messages.filter((_, idx) => idx !== i));
                  }}
                  onDelete={() => setMessages(messages.filter((_, idx) => idx !== i))}
                  listeners={listeners}
                  attributes={attributes}
                  isDragging={isDragging}
                />
              </div>
            );
          })}
        </SortableContext>
      </DndContext>
      <div className="mt-8 border-t pt-8">
        <h3 className="font-semibold mb-2">Tambah/Edit Drip Message</h3>
        <RichTextToolbar
          onBold={() => setMsgDraft(d => ({ ...d, message: d.message + '**bold**' }))}
          onItalic={() => setMsgDraft(d => ({ ...d, message: d.message + '*italic*' }))}
          onEmoji={() => setMsgDraft(d => ({ ...d, message: d.message + '😊' }))}
        />
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <Label>Pesan *</Label>
            <Textarea value={msgDraft.message} onChange={e => setMsgDraft({ ...msgDraft, message: e.target.value })} rows={4} />
          </div>
          <div className="w-48">
            <Label>Tipe</Label>
            <select className="border rounded px-2 py-1 w-full" value={msgDraft.type} onChange={e => setMsgDraft({ ...msgDraft, type: e.target.value })}>
              <option value="text">Text</option>
              <option value="image">Image</option>
              <option value="file">File</option>
            </select>
            <Label className="mt-2 block">Delay (menit)</Label>
            <Input type="number" min={0} value={msgDraft.delay} onChange={e => setMsgDraft({ ...msgDraft, delay: Number(e.target.value) })} />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button onClick={() => {
            if (!msgDraft.message.trim()) return toast.error("Pesan wajib diisi");
            setMessages([...messages, { ...msgDraft, order: messages.length + 1 }]);
            setMsgDraft({ message: "", type: "text", delay: 0, order: messages.length + 2 });
          }}><PlusCircle className="w-4 h-4 mr-1" />{msgDraft.order <= messages.length ? 'Update' : 'Tambah'}</Button>
          <Button variant="outline" onClick={() => setMsgDraft({ message: "", type: "text", delay: 0, order: messages.length + 1 })}>Reset</Button>
        </div>
      </div>
      <div className="flex justify-between mt-10">
        <Button variant="outline" onClick={() => setStep(0)}><ArrowLeft className="mr-2 w-4 h-4" />Back</Button>
        <Button onClick={() => {
          if (messages.length === 0) return toast.error("Minimal 1 pesan drip");
          setStep(2);
        }}>Next</Button>
      </div>
    </div>
  );

  // Step 3: Subscriber
  const renderStep3 = () => (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Subscriber</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label>Nomor WhatsApp *</Label>
            <Input value={subDraft.contact_id} onChange={e => setSubDraft({ contact_id: e.target.value })} placeholder="628xxxx" />
          </div>
          <Button onClick={() => {
            if (!/^\d{10,15}$/.test(subDraft.contact_id)) return toast.error("Nomor tidak valid");
            setSubscribers([...subscribers, subDraft]);
            setSubDraft({ contact_id: "" });
          }}><PlusCircle className="w-4 h-4 mr-1" />Tambah</Button>
        </div>
        <div>
          <Label>Daftar Subscriber</Label>
          <ul className="divide-y border rounded mt-2">
            {subscribers.length === 0 && <li className="p-4 text-center text-gray-400">Belum ada subscriber</li>}
            {subscribers.map((sub, i) => (
              <li key={i} className="flex items-center justify-between p-2">
                <div>{sub.contact_id}</div>
                <Button size="icon" variant="destructive" onClick={() => setSubscribers(subscribers.filter((_, idx) => idx !== i))}><Trash2 className="w-4 h-4" /></Button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-2 w-4 h-4" />Back</Button>
          <Button onClick={() => {
            if (subscribers.length === 0) return toast.error("Minimal 1 subscriber");
            setStep(3);
          }}>Next</Button>
        </div>
      </CardContent>
    </Card>
  );

  // Step 4: Review & Submit
  const renderStep4 = () => (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Review & Submit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="font-bold mb-1">Nama Campaign:</div>
          <div>{name}</div>
        </div>
        <div>
          <div className="font-bold mb-1">Deskripsi:</div>
          <div>{description || <span className="text-gray-400">(Tidak ada)</span>}</div>
        </div>
        <div>
          <div className="font-bold mb-1">Pesan Drip:</div>
          <ul className="list-disc ml-6">
            {messages.map((msg, i) => (
              <li key={i}>{msg.message} <span className="text-xs text-gray-500">({msg.type}, delay: {msg.delay}m)</span></li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-bold mb-1">Subscribers:</div>
          <ul className="list-disc ml-6">
            {subscribers.map((sub, i) => (
              <li key={i}>{sub.contact_id}</li>
            ))}
          </ul>
        </div>
        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="mr-2 w-4 h-4" />Back</Button>
          <Button disabled={isSubmitting} onClick={async () => {
            setIsSubmitting(true);
            try {
              // 1. Create campaign
              const res = await fetch(`${API_URL}/drip/campaigns`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, description })
              });
              if (!res.ok) throw new Error("Gagal membuat campaign");
              const campaign = await res.json();
              // 2. Add messages
              for (const msg of messages) {
                await fetch(`${API_URL}/drip/campaigns/${campaign.id}/messages`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(msg)
                });
              }
              // 3. Add subscribers
              for (const sub of subscribers) {
                await fetch(`${API_URL}/drip/campaigns/${campaign.id}/subscribers`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(sub)
                });
              }
              toast.success("Campaign berhasil dibuat!");
              navigate("/dashboard/campaign");
            } catch (e) {
              toast.error("Gagal submit campaign");
            } finally {
              setIsSubmitting(false);
            }
          }}>Submit</Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Buat Drip Campaign Baru</h1>
        <p className="mb-8 text-gray-500">Ikuti langkah-langkah berikut untuk membuat campaign drip WhatsApp dengan mudah.</p>
        {renderStepper()}
        <div className="mt-8">
          {step === 0 && renderStep1()}
          {step === 1 && renderStep2()}
          {step === 2 && renderStep3()}
          {step === 3 && renderStep4()}
        </div>
      </div>
    </div>
  );
};

// Komponen RichTextToolbar
function RichTextToolbar({ onBold, onItalic, onEmoji }: { onBold: () => void, onItalic: () => void, onEmoji: () => void }) {
  return (
    <div className="flex gap-2 mb-2">
      <Button size="icon" variant="ghost" onClick={onBold}><Bold className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" onClick={onItalic}><Italic className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" onClick={onEmoji}><Smile className="w-4 h-4" /></Button>
    </div>
  );
}

// Komponen SortableDripCard
function SortableDripCard({ id, msg, onEdit, onDelete, listeners, attributes, isDragging }: any) {
  return (
    <div
      className={`rounded-lg bg-white dark:bg-zinc-900 shadow p-4 mb-4 flex flex-col gap-2 border transition-all ${isDragging ? 'ring-2 ring-primary' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex justify-between items-center">
        <div className="font-semibold text-lg flex items-center gap-2">
          <span className="inline-block bg-primary/10 text-primary px-2 py-1 rounded text-xs">Drip #{msg.order}</span>
          <span>{msg.message.slice(0, 32) || <span className="text-gray-400">(No message)</span>}</span>
        </div>
        <div className="flex gap-2">
          <Button size="icon" variant="ghost" onClick={onEdit}><Edit2 className="w-4 h-4" /></Button>
          <Button size="icon" variant="destructive" onClick={onDelete}><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>
      <div className="text-xs text-gray-500">Tipe: {msg.type} | Delay: {msg.delay} menit</div>
    </div>
  );
}

export default CampaignCreatePage; 