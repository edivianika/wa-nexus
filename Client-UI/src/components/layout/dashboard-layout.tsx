import { Outlet } from "react-router-dom";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full bg-background">
        {/* Sidebar */}
        <DashboardSidebar 
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        {/* Main Content */}
        <div className={cn(
          "flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out",
          isSidebarOpen ? "ml-64" : "ml-16"
        )}>
          {/* Header */}
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 backdrop-blur px-4">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">Dashboard</h1>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle />
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-auto">
            <div className="container py-6 px-4 max-w-full mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
