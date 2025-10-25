import { Link, useLocation } from "react-router-dom";
import { 
  Smartphone, FileText, BookOpen, User, LogOut, ChevronLeft, CreditCard, 
  Ticket, Bot, ShoppingBag, Contact, Megaphone, ListFilter, PlusCircle, Zap, 
  Users, MessageSquare, Clock, CalendarClock, BarChart3, LayoutGrid
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

interface NavItem {
  title: string;
  path: string;
  icon: React.ReactNode;
  children?: NavItem[];
}

interface DashboardSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function DashboardSidebar({ isOpen, onToggle }: DashboardSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const { theme } = useTheme();

  const baseNavItems: NavItem[] = [
    {
      title: "Devices",
      path: "/dashboard/devices",
      icon: <Smartphone className="h-5 w-5" />
    },
    {
      title: "Agen AI",
      path: "/dashboard/ai-agents",
      icon: <Bot className="h-5 w-5" />
    },
    {
      title: "Triggers",
      path: "/dashboard/triggers",
      icon: <Zap className="h-5 w-5" />
    },
    {
      title: "Message",
      path: "/dashboard/message",
      icon: <MessageSquare className="h-5 w-5" />,
      children: [
        {
          title: "Broadcast",
          path: "/dashboard/broadcast/list",
          icon: <Megaphone className="h-5 w-5" />
        },
        {
          title: "Broadcast Analytics",
          path: "/dashboard/broadcast/analytics",
          icon: <BarChart3 className="h-5 w-5" />
        },
        {
          title: "Drip Campaign",
          path: "/dashboard/drip-campaign",
          icon: <CalendarClock className="h-5 w-5" />
        }
      ]
    },
    {
      title: "Contact",
      path: "/dashboard/contacts",
      icon: <Contact className="h-5 w-5" />,
      children: [
        {
          title: "Daftar Kontak",
          path: "/dashboard/contacts",
          icon: <Contact className="h-4 w-4" />
        },
        {
          title: "Segmen Kontak",
          path: "/dashboard/contact-segments",
          icon: <Users className="h-4 w-4" />
        },
        {
          title: "Kanban Board",
          path: "/dashboard/kanban",
          icon: <LayoutGrid className="h-4 w-4" />
        },
        {
          title: "Statistik",
          path: "/dashboard/contact-statistics",
          icon: <BarChart3 className="h-4 w-4" />
        }
      ]
    },
    // Edi Matikan --
    // {
    //   title: "Produk",
    //   path: "/dashboard/produk",
    //   icon: <ShoppingBag className="h-5 w-5" />
    // },
    {
      title: "Documentation",
      path: "/dashboard/documentation",
      icon: <FileText className="h-5 w-5" />
    },
    {
      title: "Tutorial",
      path: "/dashboard/tutorial",
      icon: <BookOpen className="h-5 w-5" />
    },
    {
      title: "Langganan",
      path: "/dashboard/subscription",
      icon: <CreditCard className="h-5 w-5" />
    },
    {
      title: "Account",
      path: "/dashboard/account",
      icon: <User className="h-5 w-5" />
    }
  ];

  const adminNavItem: NavItem = {
    title: "Generate Kupon",
    path: "/dashboard/generate-kupon",
    icon: <Ticket className="h-5 w-5" />
  };
  
  const navItems = isAdmin ? [...baseNavItems, adminNavItem] : baseNavItems;
  
  const isActive = (path: string) => {
    // Untuk parent menu "Message", aktifkan parent jika berada di halaman child manapun
    if (path === "/dashboard/message" && (
      location.pathname.startsWith("/dashboard/broadcast/") || 
      location.pathname.startsWith("/dashboard/drip-campaign")
    )) {
      return true;
    }
    
    // Untuk parent menu "Contact", aktifkan parent jika berada di halaman child manapun
    if (path === "/dashboard/contacts" && (
      location.pathname === "/dashboard/contacts" ||
      location.pathname === "/dashboard/contact-segments" ||
      location.pathname.startsWith("/dashboard/kanban") ||
      location.pathname === "/dashboard/contact-statistics"
    )) {
      return true;
    }
    
    return location.pathname === path;
  };

  const isChildActive = (path: string) => {
    // Untuk menu Broadcast, hanya aktif saat di halaman list atau create
    if (path === "/dashboard/broadcast/list") {
      return location.pathname === "/dashboard/broadcast/list" || 
             location.pathname === "/dashboard/broadcast/create";
    }
    
    // Untuk menu Broadcast Analytics, hanya aktif saat di halaman analytics
    if (path === "/dashboard/broadcast/analytics") {
      return location.pathname === "/dashboard/broadcast/analytics";
    }
    
    // Untuk menu Drip Campaign, aktif saat di halaman drip campaign manapun
    if (path === "/dashboard/drip-campaign") {
      return location.pathname.startsWith("/dashboard/drip-campaign");
    }
    
    // Untuk menu Contact, aktif saat berada di halaman contacts
    if (path === "/dashboard/contacts" && location.pathname === "/dashboard/contacts") {
      return true;
    }
    
    // Untuk menu Segmen Kontak, aktif saat berada di halaman contact segments
    if (path === "/dashboard/contact-segments") {
      return location.pathname === "/dashboard/contact-segments";
    }
    
    // Untuk menu Kanban, aktif saat berada di halaman kanban
    if (path === "/dashboard/kanban") {
      return location.pathname.startsWith("/dashboard/kanban");
    }
    
    // Untuk menu Statistik, aktif saat berada di halaman contact statistics
    if (path === "/dashboard/contact-statistics") {
      return location.pathname === "/dashboard/contact-statistics";
    }
    
    // Untuk menu lainnya
    return location.pathname === path;
  };

  const toggleExpand = (title: string) => {
    setExpandedItems(prev => 
      prev.includes(title) 
        ? prev.filter(item => item !== title) 
        : [...prev, title]
    );
  };

  useEffect(() => {
    // Auto-expand parent menu if a child route is active
    navItems.forEach(item => {
      if (item.children) {
        const shouldExpand = item.children.some(child => {
          // Menu Message/Broadcast
          if (child.path === "/dashboard/broadcast/list") {
            return location.pathname.startsWith("/dashboard/broadcast/");
          }
          
          // Menu Message/Drip Campaign
          if (child.path === "/dashboard/drip-campaign") {
            return location.pathname.startsWith("/dashboard/drip-campaign");
          }
          
          // Menu Contact
          if (child.title === "Daftar Kontak" || child.title === "Segmen Kontak" || child.title === "Kanban Board" || child.title === "Statistik") {
            return location.pathname === "/dashboard/contacts" || 
                   location.pathname === "/dashboard/contact-segments" ||
                   location.pathname.startsWith("/dashboard/kanban") ||
                   location.pathname === "/dashboard/contact-statistics";
          }
          
          return location.pathname === child.path;
        });
        
        if (shouldExpand && !expandedItems.includes(item.title)) {
          setExpandedItems(prev => [...prev, item.title]);
        }
      }
    });
  }, [location.pathname, expandedItems]);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        setUser(data?.user || null);
        
        if (data?.user) {
          // Simpan user ID di localStorage untuk digunakan di seluruh aplikasi
          localStorage.setItem('user_id', data.user.id);
          
          // Check if user is admin by email instead of querying a non-existent table
          if (data.user.email === 'akhivian@gmail.com') {
            setIsAdmin(true);
          }
        }
      } catch (error) {
        console.error("Error checking authentication:", error);
      } finally {
        setIsAuthChecked(true);
      }
    };
    
    checkUser();
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate("/login");
      toast.success("Logged out successfully");
    } catch (error) {
      console.error("Error logging out:", error);
      toast.error("Failed to log out");
    }
  };

  if (!isAuthChecked) {
    return (
      <aside className={cn(
        "fixed top-0 left-0 h-full bg-sidebar border-r border-sidebar-border",
        "transition-all duration-300 ease-in-out",
        isOpen ? "w-64" : "w-16",
        "flex flex-col z-40"
      )}>
        <div className="flex-1 flex items-center justify-center">
          {/* Loading indicator */}
        </div>
      </aside>
    );
  }

  if (!user) {
    navigate("/login");
    return null;
  }

  return (
    <aside 
      className={cn(
        "fixed top-0 left-0 h-full bg-sidebar border-r border-sidebar-border",
        "transition-all duration-300 ease-in-out",
        isOpen ? "w-64" : "w-16",
        "flex flex-col z-40"
      )}
    >
      <div className="h-16 flex items-center px-4 border-b border-sidebar-border">
        <Link 
          to="/dashboard" 
          className={cn(
            "flex items-center gap-2 transition-opacity duration-300",
            !isOpen && "opacity-0"
          )}
        >
          <span className="font-bold text-xl text-sidebar-foreground whitespace-nowrap">
            WA Nexus
          </span>
        </Link>
      </div>

      <Button
        variant="outline"
        size="icon"
        onClick={onToggle}
        className={cn(
          "absolute -right-4 top-12 z-50",
          "h-8 w-8 rounded-full transition-all duration-300",
          "bg-background border shadow-sm",
          !isOpen && "-rotate-180"
        )}
      >
        <ChevronLeft className="h-4 w-4 text-foreground" />
      </Button>

      <div className="flex flex-col flex-1 h-full overflow-hidden">
        <nav className="flex-1 overflow-y-auto py-4 px-2 custom-scrollbar">
          <div className="space-y-1">
            {navItems.map((item) => (
              <div key={item.path} className="flex flex-col">
                {item.children ? (
                  <>
                    <button
                      onClick={() => toggleExpand(item.title)}
                      className={cn(
                        "flex items-center justify-between gap-3 px-3 h-10 rounded-md text-sm font-medium w-full",
                        "transition-all duration-200 ease-in-out text-sidebar-foreground",
                        "hover:bg-sidebar-accent hover:text-sidebar-foreground",
                        isActive(item.path) && "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm",
                        !isOpen && "justify-center px-0"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-current">
                          {item.icon}
                        </span>
                        <span className={cn(
                          "transition-all duration-300",
                          !isOpen && "w-0 opacity-0"
                        )}>
                          {item.title}
                        </span>
                      </div>
                      {isOpen && (
                        <ChevronLeft className={cn(
                          "h-4 w-4 transition-transform",
                          expandedItems.includes(item.title) ? "rotate-90" : "-rotate-0"
                        )} />
                      )}
                    </button>
                    
                    {/* Child items */}
                    {isOpen && expandedItems.includes(item.title) && (
                      <div className="pl-8 mt-1 space-y-1">
                        {item.children.map(child => (
                          <Link
                            key={child.path}
                            to={child.path}
                            className={cn(
                              "flex items-center gap-3 px-3 h-8 rounded-md text-sm text-sidebar-foreground/70",
                              "transition-all duration-200 ease-in-out",
                              "hover:bg-sidebar-accent hover:text-sidebar-foreground",
                              isChildActive(child.path) && "bg-sidebar-accent text-sidebar-foreground"
                            )}
                          >
                            <span className="text-current">
                              {child.icon}
                            </span>
                            <span>{child.title}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-3 h-10 rounded-md text-sm font-medium",
                      "transition-all duration-200 ease-in-out text-sidebar-foreground",
                      "hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      isActive(item.path) && "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm",
                      !isOpen && "justify-center px-0"
                    )}
                  >
                    <span className="text-current">
                      {item.icon}
                    </span>
                    <span className={cn(
                      "transition-all duration-300",
                      !isOpen && "w-0 opacity-0"
                    )}>
                      {item.title}
                    </span>
                  </Link>
                )}
              </div>
            ))}
          </div>
        </nav>
        <div className="p-2 pt-2 border-t border-sidebar-border">
          <Button
            variant="ghost"
            className={cn(
              "w-full flex items-center gap-3 justify-start text-sidebar-foreground",
              "hover:bg-sidebar-accent hover:text-sidebar-foreground",
              !isOpen && "justify-center px-0"
            )}
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5" />
            <span className={cn(
              "transition-all duration-300",
              !isOpen && "w-0 opacity-0"
            )}>
              Logout
            </span>
          </Button>
        </div>
      </div>
    </aside>
  );
}
