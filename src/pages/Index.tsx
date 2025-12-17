import { useState } from "react";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import Features from "@/components/Features";
import Dashboard from "@/components/Dashboard";
import Footer from "@/components/Footer";
import FileUpload from "@/components/FileUpload";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const { user } = useAuth();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();

  const handleFileUpload = (file: File) => {
    setSelectedFile(file);
    setUploadModalOpen(true);
  };

  const handleUploadComplete = () => {
    setUploadModalOpen(false);
    setSelectedFile(null);
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
      <Dashboard />
      <Footer />

      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Your Transactions</DialogTitle>
          </DialogHeader>
          <FileUpload onUploadComplete={handleUploadComplete} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
