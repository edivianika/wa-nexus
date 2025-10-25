import { useEffect, useState } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const Register = () => {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  
  useEffect(() => {
    let isMounted = true;
    
    // Check if user is already authenticated
    const checkAuth = async () => {
      try {
        setIsChecking(true);
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!isMounted) return;
        
        if (session) {
          navigate("/dashboard", { replace: true });
        }
      } catch (error) {
        console.error("Session check error:", error);
      } finally {
        if (isMounted) {
          setIsChecking(false);
        }
      }
    };
    
    checkAuth();
    
    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [navigate]);
  
  // Tampilkan loading saat memeriksa session
  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }
  
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center px-4 border-b">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-wa-green">WA Nexus</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center p-4 md:p-8">
        <div className="mx-auto w-full max-w-md space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold">Create an Account</h1>
            <p className="text-muted-foreground">Enter your information to create an account</p>
          </div>
          <AuthForm type="register" />
        </div>
      </main>
      <footer className="border-t py-4 px-4 md:px-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 md:gap-0">
          <p className="text-sm text-muted-foreground">
            © 2025 WA Nexus. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link to="#" className="text-sm">Terms</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="#" className="text-sm">Privacy Policy</Link>
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Register;
