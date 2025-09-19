import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FileUploadProps {
  onUploadComplete?: () => void;
}

const FileUpload = ({ onUploadComplete }: FileUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.xlsx')) {
      setError("Please upload a CSV or Excel file");
      return;
    }

    setUploading(true);
    setProgress(0);
    setError("");
    setResult(null);

    try {
      // Read file content
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          
          setProgress(25);

          // Get current session
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            throw new Error("Please log in to upload transactions");
          }

          setProgress(50);

          // Call the process-transactions edge function
          const { data, error } = await supabase.functions.invoke('process-transactions', {
            body: {
              csv_data: content,
              filename: file.name
            },
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });

          setProgress(75);

          if (error) {
            throw new Error(error.message || 'Failed to process transactions');
          }

          setProgress(100);
          setResult(data);

          toast({
            title: "Upload successful!",
            description: `Processed ${data.processed_transactions} transactions successfully.`,
          });

          onUploadComplete?.();

        } catch (error: any) {
          console.error('Processing error:', error);
          setError(error.message);
          toast({
            title: "Upload failed",
            description: error.message,
            variant: "destructive",
          });
        } finally {
          setUploading(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      };

      reader.onerror = () => {
        setError("Failed to read file");
        setUploading(false);
      };

      reader.readAsText(file);

    } catch (error: any) {
      setError(error.message);
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Transactions
        </CardTitle>
        <CardDescription>
          Upload your bank statement CSV or Excel file to get started with AI-powered financial insights
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
          <div className="flex flex-col items-center gap-4">
            <FileText className="h-12 w-12 text-gray-400" />
            <div>
              <p className="text-sm text-gray-600 mb-2">
                Drag and drop your file here or click to browse
              </p>
              <p className="text-xs text-gray-500">
                Supported formats: CSV, Excel (.xlsx)
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              id="file-upload"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Processing..." : "Choose File"}
            </Button>
          </div>
        </div>

        {uploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Processing transactions...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">Upload completed successfully!</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Processed:</span> {result.processed_transactions} transactions
                  </div>
                  <div>
                    <span className="font-medium">Total rows:</span> {result.total_rows}
                  </div>
                  <div>
                    <span className="font-medium">Duplicates removed:</span> {result.duplicate_count || 0}
                  </div>
                  <div>
                    <span className="font-medium">Categories detected:</span> {result.categories_detected?.length || 0}
                  </div>
                </div>
                {result.errors && result.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium text-yellow-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Some rows had issues:
                    </p>
                    <ul className="text-xs text-yellow-700 ml-4 mt-1">
                      {result.errors.slice(0, 3).map((error: string, index: number) => (
                        <li key={index}>• {error}</li>
                      ))}
                      {result.errors.length > 3 && (
                        <li>• ... and {result.errors.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="text-xs text-gray-500 space-y-1">
          <p><strong>Expected CSV format:</strong></p>
          <p>• Date, Description/Merchant, Amount (with + for income, - for expenses)</p>
          <p>• Headers like: Date, Description, Amount, Account, Category (optional)</p>
          <p><strong>Note:</strong> Your data is processed securely and stored with encryption.</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default FileUpload;