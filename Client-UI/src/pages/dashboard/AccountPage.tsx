import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const AccountPage = () => {
  const navigate = useNavigate();
  const [isUpdating, setIsUpdating] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profileData, setProfileData] = useState({
    name: "",
    email: "",
    company: "",
    notifications: {
      email: true,
      push: false
    },
    theme: "dark"
  });

  // Fetch user data from Supabase
  useEffect(() => {
    let isMounted = true;
    
    const fetchUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!isMounted) return;
        
        if (!user) {
          // User tidak ditemukan, tapi tidak perlu redirect karena
          // dashboard-sidebar sudah menangani ini
          return;
        }
        
        setUser(user);
        setProfileData(prevData => ({
          ...prevData,
          email: user.email || "",
          name: user.user_metadata?.name || user.email.split('@')[0] || "",
          company: user.user_metadata?.company || ""
        }));
      } catch (error) {
        if (isMounted) {
          console.error('Error fetching user data:', error);
        }
      }
    };
    
    fetchUserData();
    
    // Cleanup
    return () => {
      isMounted = false;
    };
  }, []);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    
    try {
      // Update user metadata in Supabase
      const { data, error } = await supabase.auth.updateUser({
        data: {
          name: profileData.name,
          company: profileData.company
        }
      });
      
      if (error) {
        throw error;
      }
      
      toast.success("Profile updated successfully");
      // Update local user state
      setUser({
        ...user,
        user_metadata: {
          ...user.user_metadata,
          name: profileData.name,
          company: profileData.company
        }
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to update profile");
      console.error(error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const currentPassword = (form.elements.namedItem('current-password') as HTMLInputElement).value;
    const newPassword = (form.elements.namedItem('new-password') as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem('confirm-password') as HTMLInputElement).value;
    
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    
    setIsUpdating(true);
    
    try {
      // Update password in Supabase
      // Note: Supabase doesn't require the current password for updates
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      
      if (error) {
        throw error;
      }
      
      toast.success("Password updated successfully");
      form.reset();
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
      console.error(error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfileData({
      ...profileData,
      [name]: value
    });
  };

  const handleNotificationChange = (key: string, checked: boolean) => {
    setProfileData({
      ...profileData,
      notifications: {
        ...profileData.notifications,
        [key]: checked
      }
    });
  };

  const handleThemeChange = (value: string) => {
    setProfileData({
      ...profileData,
      theme: value
    });
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences.
        </p>
      </div>
      
      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
        </TabsList>
        
        <TabsContent value="profile" className="space-y-4">
          <Card>
            <form onSubmit={handleProfileSubmit}>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>
                  Update your personal information.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input 
                    id="name" 
                    name="name" 
                    value={profileData.name} 
                    onChange={handleInputChange} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    name="email" 
                    type="email" 
                    value={profileData.email} 
                    onChange={handleInputChange}
                    disabled
                  />
                  <p className="text-xs text-muted-foreground">
                    Email cannot be changed. Contact support if you need to update your email address.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input 
                    id="company" 
                    name="company" 
                    value={profileData.company} 
                    onChange={handleInputChange} 
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isUpdating}>
                  {isUpdating ? "Saving..." : "Save changes"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>
        
        <TabsContent value="password" className="space-y-4">
          <Card>
            <form onSubmit={handlePasswordSubmit}>
              <CardHeader>
                <CardTitle>Password</CardTitle>
                <CardDescription>
                  Change your password.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current password</Label>
                  <Input id="current-password" type="password" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input id="new-password" type="password" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input id="confirm-password" type="password" required />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isUpdating}>
                  {isUpdating ? "Updating..." : "Update password"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>
        
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Configure how you receive notifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="email-notifications" className="flex flex-col space-y-1">
                  <span>Email notifications</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Receive notifications via email.
                  </span>
                </Label>
                <Switch
                  id="email-notifications"
                  checked={profileData.notifications.email}
                  onCheckedChange={(checked) => handleNotificationChange("email", checked)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="push-notifications" className="flex flex-col space-y-1">
                  <span>Push notifications</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Receive push notifications on your devices.
                  </span>
                </Label>
                <Switch
                  id="push-notifications"
                  checked={profileData.notifications.push}
                  onCheckedChange={(checked) => handleNotificationChange("push", checked)}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                onClick={() => {
                  setIsUpdating(true);
                  setTimeout(() => {
                    toast.success("Notification preferences saved");
                    setIsUpdating(false);
                  }, 1000);
                }}
                disabled={isUpdating}
              >
                {isUpdating ? "Saving..." : "Save preferences"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="appearance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize the appearance of the application.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <Label>Theme</Label>
                <RadioGroup 
                  value={profileData.theme} 
                  onValueChange={handleThemeChange}
                  className="flex flex-col space-y-3"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="light" id="theme-light" />
                    <Label htmlFor="theme-light" className="cursor-pointer">Light</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="dark" id="theme-dark" />
                    <Label htmlFor="theme-dark" className="cursor-pointer">Dark</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="system" id="theme-system" />
                    <Label htmlFor="theme-system" className="cursor-pointer">System</Label>
                  </div>
                </RadioGroup>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                onClick={() => {
                  setIsUpdating(true);
                  setTimeout(() => {
                    toast.success("Appearance settings saved");
                    setIsUpdating(false);
                  }, 1000);
                }}
                disabled={isUpdating}
              >
                {isUpdating ? "Saving..." : "Save settings"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AccountPage;
