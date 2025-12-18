import { useState } from "react";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import Features from "@/components/Features";
import Dashboard from "@/components/Dashboard";
import Footer from "@/components/Footer";
import FileUpload from "@/components/FileUpload";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const { user } = useAuth();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { toast } = useToast();

  const handleFileUpload = (file: File) => {
    setSelectedFile(file);
    setUploadModalOpen(true);
  };

  const handleUploadComplete = () => {
    setUploadModalOpen(false);
    setSelectedFile(null);
    setRefreshKey(prev => prev + 1); // Force dashboard refresh
    toast({
      title: "Upload complete",
      description: "Your transactions have been processed successfully!",
    });
  };

  return (
    <div className="min-h-screen">
      <Header />
      <HeroSection onFileUpload={handleFileUpload} />
      <Features />
      <Dashboard key={refreshKey} onFileUpload={handleFileUpload} />
      <Footer />

      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Your Transactions</DialogTitle>
            <DialogDescription>
              Upload a CSV or Excel file containing your transaction data for AI-powered analysis.
            </DialogDescription>
          </DialogHeader>
          <FileUpload onUploadComplete={handleUploadComplete} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
