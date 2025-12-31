import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import Auth from "./pages/Auth";
import TeamSetup from "./pages/TeamSetup";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import AddItem from "./pages/AddItem";
import ItemDetail from "./pages/ItemDetail";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Tasks from "./pages/Tasks";
import FacebookTools from "./pages/FacebookTools";
import RoughNotes from "./pages/RoughNotes";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/team-setup" element={
              <ProtectedRoute requireTeam={false}>
                <TeamSetup />
              </ProtectedRoute>
            } />
            <Route path="/" element={
              <ProtectedRoute>
                <AppLayout><Dashboard /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/inventory" element={
              <ProtectedRoute>
                <AppLayout><Inventory /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/add" element={
              <ProtectedRoute>
                <AppLayout><AddItem /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/item/:id" element={
              <ProtectedRoute>
                <AppLayout><ItemDetail /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/analytics" element={
              <ProtectedRoute>
                <AppLayout><Analytics /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute>
                <AppLayout><Settings /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/tasks" element={
              <ProtectedRoute>
                <AppLayout><Tasks /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/facebook-tools" element={
              <ProtectedRoute>
                <AppLayout><FacebookTools /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/rough-notes" element={
              <ProtectedRoute>
                <AppLayout><RoughNotes /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
