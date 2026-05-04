import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

interface Props {
  onFileUpload: () => void;
  variant?: "hero" | "compact";
  hasData?: boolean;
}

const UploadCTA = ({ onFileUpload, variant = "compact", hasData = false }: Props) => {
  if (variant === "hero") {
    return (
      <section className="py-12">
        <div className="container px-4">
          <Card className="bg-gradient-primary text-white border-0 shadow-elevated max-w-3xl mx-auto">
            <CardContent className="p-8 text-center">
              <Upload className="h-12 w-12 mx-auto mb-4 opacity-90" />
              <h3 className="text-2xl font-bold mb-2">Ready to Get Started?</h3>
              <p className="mb-6 opacity-90">
                Upload your bank statements or transaction CSV files to begin your AI-powered financial analysis.
              </p>
              <Button
                variant="secondary"
                size="lg"
                className="bg-white text-primary hover:bg-white/90"
                onClick={onFileUpload}
              >
                Upload Your Data
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12">
      <div className="container px-4">
        <div className="text-center mb-4">
          <h3 className="text-2xl font-bold">Add More Data</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Upload another statement to keep your insights fresh.
          </p>
        </div>
        <Card className="border border-border/60 shadow-sm max-w-2xl mx-auto">
          <CardContent className="p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                <Upload className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="font-medium text-sm">Upload another file</p>
                <p className="text-xs text-muted-foreground">CSV or Excel · processed locally</p>
              </div>
            </div>
            <Button onClick={onFileUpload} size="sm">
              Upload
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default UploadCTA;
