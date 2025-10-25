import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase, registerUser, checkDatabaseConnection } from "@/integrations/supabase/client";

interface AuthFormProps {
  type: "login" | "register";
}

export function AuthForm({ type }: AuthFormProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Form validation
    if (!formData.email || !formData.password) {
      toast.error("Please fill in all required fields");
      setIsLoading(false);
      return;
    }
    
    if (type === "register" && formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      setIsLoading(false);
      return;
    }
    
    try {
      if (type === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        
        if (error) {
          throw error;
        }
        
        // Store user ID in localStorage
        if (data && data.user) {
          localStorage.setItem('userId', data.user.id);
          console.log('User ID stored in localStorage:', data.user.id);
        }
        
        toast.success("Login successful");
        
        // Gunakan timeout kecil sebelum redirect untuk memastikan toast ditampilkan
        setTimeout(() => {
          navigate("/dashboard", { replace: true });
        }, 300);
      } else {
        // Registrasi pengguna baru dengan pendekatan REST API langsung
        try {
          // Dapatkan URL Supabase
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://ovscsiulvdgwamhlkwkq.supabase.co";
          const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92c2NzaXVsdmRnd2FtaGxrd2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NjY4MjEsImV4cCI6MjA1ODE0MjgyMX0.1BpvEPUYrDETlHFomNO8EsZBmoSypu5GEsJwlIfNCxc";
          
          // Buat request langsung ke API Supabase
          const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'X-Client-Info': 'supabase-js/2.0.0'
            },
            body: JSON.stringify({
              email: formData.email,
              password: formData.password,
              gotrue_meta_security: {}
            })
          });
          
          const result = await response.json();
          
          // Periksa respons API
          if (response.ok) {
            // Store user ID in localStorage if available
            if (result && result.user && result.user.id) {
              localStorage.setItem('userId', result.user.id);
            }
            
            toast.success("Pendaftaran berhasil! Silakan periksa email Anda untuk verifikasi.");
            
            // Redirect ke login setelah beberapa saat
            setTimeout(() => {
              navigate("/login", { replace: true });
            }, 1500);
          } else {
            // Handle error dari API
            console.error("API error:", result);
            
            // Pesan error khusus
            if (result.msg?.includes('User already registered')) {
              toast.error("Email sudah terdaftar. Silakan login atau gunakan email lain.");
            } else if (result.msg) {
              toast.error(`Error: ${result.msg}`);
            } else {
              toast.error("Gagal mendaftar. Silakan coba lagi nanti.");
            }
          }
        } catch (registerError: any) {
          console.error("Register API error:", registerError);
          toast.error("Tidak dapat terhubung ke server. Periksa koneksi internet Anda.");
        }
      }
    } catch (error: any) {
      console.error("Auth form error:", error);
      let errorMessage = "Authentication failed";
      
      // Tampilkan pesan error yang lebih user-friendly
      if (error.message.includes("Invalid login")) {
        errorMessage = "Email atau password salah";
      } else if (error.message.includes("Email")) {
        errorMessage = "Format email tidak valid";
      } else if (error.message.includes("password")) {
        errorMessage = "Password tidak memenuhi persyaratan keamanan (min. 6 karakter)";
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{type === "login" ? "Login" : "Create an Account"}</CardTitle>
        <CardDescription>
          {type === "login" 
            ? "Enter your credentials to access your account" 
            : "Fill in the form to create your account"}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="name@example.com"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>
          {type === "register" && (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Processing..." : type === "login" ? "Login" : "Sign Up"}
          </Button>
          <div className="text-center text-sm">
            {type === "login" ? (
              <p>
                Don't have an account?{" "}
                <Button variant="link" className="p-0" onClick={() => navigate("/register")}>
                  Sign up
                </Button>
              </p>
            ) : (
              <p>
                Already have an account?{" "}
                <Button variant="link" className="p-0" onClick={() => navigate("/login")}>
                  Login
                </Button>
              </p>
            )}
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
