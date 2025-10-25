import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import { DashboardLayout } from "./components/layout/dashboard-layout";
import DevicesPage from "./pages/dashboard/DevicesPage";
import DocumentationPage from "./pages/dashboard/DocumentationPage";
import TutorialPage from "./pages/dashboard/TutorialPage";
import AccountPage from "./pages/dashboard/AccountPage";
import SubscriptionPage from "./pages/dashboard/SubscriptionPage";
import GenerateKuponPage from "./pages/dashboard/generate-kupon";
import AIAgentsPage from "./pages/dashboard/AIAgentsPage";
import AIAgentSettingsPage from "./pages/dashboard/AIAgentSettingsPage";
import ProdukPage from "./pages/dashboard/ProdukPage";
import ContactsPage from "./pages/dashboard/ContactsPage";
import BroadcastPage from "./pages/dashboard/BroadcastPage";
import BroadcastListPage from "./pages/dashboard/BroadcastListPage";
import BroadcastAnalyticsPage from "./pages/dashboard/BroadcastAnalyticsPage";
import BroadcastDetailPage from "./pages/dashboard/BroadcastDetailPage";
import TriggersPage from "./pages/dashboard/TriggersPage";
import TriggerFormPage from "./pages/dashboard/TriggerFormPage";
import DripCampaignPage from "./pages/dashboard/DripCampaignPage";
import DripCampaignCreatePage from "./pages/dashboard/DripCampaignCreatePage";
import DripCampaignDetailPage from "./pages/dashboard/DripCampaignDetailPage";
import DripCampaignEditPage from "./pages/dashboard/DripCampaignEditPage";
import DripCampaignAddSubscriberPage from "./pages/dashboard/DripCampaignAddSubscriberPage";
import DripCampaignAddMessagePage from "./pages/dashboard/DripCampaignAddMessagePage";
import ContactSegmentsPage from "./pages/dashboard/ContactSegmentsPage";
import UIDemo from "./pages/UIDemo";
import KanbanPage from './pages/dashboard/KanbanPage';
import ContactStatisticsPage from "./pages/dashboard/ContactStatisticsPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider>
        <Toaster />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true
          }}
        >
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/ui-demo" element={<UIDemo />} />
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="devices" element={<DevicesPage />} />
              <Route path="ai-agents" element={<AIAgentsPage />} />
              <Route path="ai-agents/settings/:agentId" element={<AIAgentSettingsPage />} />
              <Route path="contacts" element={<ContactsPage />} />
              <Route path="broadcast" element={<Navigate to="/dashboard/broadcast/list" replace />} />
              <Route path="broadcast/create" element={<BroadcastPage />} />
              <Route path="broadcast/list" element={<BroadcastListPage />} />
              <Route path="broadcast/analytics" element={<BroadcastAnalyticsPage />} />
              <Route path="broadcast/:broadcastId" element={<BroadcastDetailPage />} />
              <Route path="message" element={<Navigate to="/dashboard/broadcast/list" replace />} />
              <Route path="drip-campaign" element={<DripCampaignPage />} />
              <Route path="drip-campaign/create" element={<DripCampaignCreatePage />} />
              <Route path="drip-campaign/:campaignId/edit" element={<DripCampaignEditPage />} />
              <Route path="drip-campaign/edit/:campaignId" element={<DripCampaignEditPage />} />
              <Route path="drip-campaign/:id" element={<DripCampaignDetailPage />} />
              <Route path="drip-campaign/:campaignId/subscribers/add" element={<DripCampaignAddSubscriberPage />} />
              <Route path="drip-campaign/:campaignId/messages/add" element={<DripCampaignAddMessagePage />} />
              <Route path="contact-segments" element={<ContactSegmentsPage />} />
              <Route path="documentation" element={<DocumentationPage />} />
              <Route path="tutorial" element={<TutorialPage />} />
              <Route path="subscription" element={<SubscriptionPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="generate-kupon" element={<GenerateKuponPage />} />
              <Route path="produk" element={<ProdukPage />} />
              <Route path="triggers" element={<TriggersPage />} />
              <Route path="triggers/add" element={<TriggerFormPage mode="add" />} />
              <Route path="triggers/edit/:id" element={<TriggerFormPage mode="edit" />} />
              <Route path="ui-demo" element={<UIDemo />} />
              <Route path="kanban" element={<KanbanPage />} />
              <Route path="contact-statistics" element={<ContactStatisticsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
