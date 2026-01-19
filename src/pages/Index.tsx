import { useState } from "react";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import Features from "@/components/Features";
import Dashboard from "@/components/Dashboard";
import Footer from "@/components/Footer";
import FileUpload, { ParsedTransaction } from "@/components/FileUpload";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const { toast } = useToast();

  const handleFileUpload = () => {
    setUploadModalOpen(true);
  };

  const handleUploadComplete = (parsedTransactions: ParsedTransaction[]) => {
    setTransactions(parsedTransactions);
    setUploadModalOpen(false);
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
      <Dashboard transactions={transactions} onFileUpload={handleFileUpload} />
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
