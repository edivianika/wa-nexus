
import { Link } from "react-router-dom";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export function Navbar({ className }: { className?: string }) {
  const navigate = useNavigate();
  
  return (
    <header className={cn("w-full border-b bg-background/95 backdrop-blur", className)}>
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center space-x-2">
            <span className="text-xl font-bold text-wa-green">WA Nexus</span>
          </Link>
          <nav className="hidden md:flex gap-6">
            <Link to="/#features" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
              Features
            </Link>
            <Link to="/#pricing" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
              Pricing
            </Link>
            <Link to="/#about" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
              About
            </Link>
          </nav>
        </div>
        
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" onClick={() => navigate("/login")}>
            Log in
          </Button>
          <Button onClick={() => navigate("/register")}>
            Sign up
          </Button>
        </div>
      </div>
    </header>
  );
}
