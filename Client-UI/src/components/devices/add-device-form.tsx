import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

interface AddDeviceFormProps {
  onAddDevice: (name: string) => void;
}

export function AddDeviceForm({ onAddDevice }: AddDeviceFormProps) {
  const [deviceName, setDeviceName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!deviceName.trim()) {
      toast.error("Device name cannot be empty");
      return;
    }
    
    onAddDevice(deviceName);
    setDeviceName("");
    setIsDialogOpen(false);
    toast.success("Device added successfully");
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button data-testid="add-device-button">
          <Plus className="mr-2 h-4 w-4" />
          Add Device
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Device</DialogTitle>
          <DialogDescription>
            Create a new WhatsApp device connection.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="device-name">Device Name</Label>
              <Input
                id="device-name"
                placeholder="Enter a name for this device"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit">Add Device</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
