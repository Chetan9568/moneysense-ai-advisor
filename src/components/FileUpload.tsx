import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FileUploadProps {
  onUploadComplete?: (transactions: ParsedTransaction[]) => void;
}

export interface ParsedTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  transaction_type: 'income' | 'expense';
}

// Categorize transaction based on description
function categorizeTransaction(description: string): string {
  const desc = description.toLowerCase();
  
  if (desc.includes('salary') || desc.includes('payroll') || desc.includes('direct deposit') || desc.includes('income')) {
    return 'Income';
  }
  if (desc.includes('grocery') || desc.includes('food') || desc.includes('restaurant') || 
      desc.includes('cafe') || desc.includes('coffee') || desc.includes('pizza') ||
      desc.includes('swiggy') || desc.includes('zomato') || desc.includes('uber eats')) {
    return 'Food & Dining';
  }
  if (desc.includes('gas') || desc.includes('fuel') || desc.includes('petrol') || 
      desc.includes('uber') || desc.includes('ola') || desc.includes('lyft') ||
      desc.includes('transport') || desc.includes('metro') || desc.includes('bus')) {
    return 'Transportation';
  }
  if (desc.includes('shop') || desc.includes('store') || desc.includes('amazon') ||
      desc.includes('flipkart') || desc.includes('walmart') || desc.includes('target') ||
      desc.includes('mall') || desc.includes('retail')) {
    return 'Shopping';
  }
  if (desc.includes('bill') || desc.includes('utility') || desc.includes('electric') ||
      desc.includes('water') || desc.includes('internet') || desc.includes('phone') ||
      desc.includes('mobile') || desc.includes('recharge')) {
    return 'Bills & Utilities';
  }
  if (desc.includes('health') || desc.includes('medical') || desc.includes('pharmacy') ||
      desc.includes('hospital') || desc.includes('doctor') || desc.includes('clinic')) {
    return 'Healthcare';
  }
  if (desc.includes('rent') || desc.includes('mortgage') || desc.includes('lease')) {
    return 'Housing';
  }
  if (desc.includes('movie') || desc.includes('netflix') || desc.includes('spotify') ||
      desc.includes('entertainment') || desc.includes('game') || desc.includes('subscription')) {
    return 'Entertainment';
  }
  if (desc.includes('transfer') || desc.includes('upi') || desc.includes('neft') ||
      desc.includes('imps') || desc.includes('payment')) {
    return 'Transfer';
  }
  if (desc.includes('atm') || desc.includes('withdrawal') || desc.includes('cash')) {
    return 'Cash Withdrawal';
  }
  
  return 'Other';
}

// Detect if transaction is income or expense from a signed numeric amount
function detectTransactionType(description: string, signedAmount: number): 'income' | 'expense' {
  const desc = description.toLowerCase();

  if (desc.includes('salary') || desc.includes('payroll') || desc.includes('refund') ||
      desc.includes('cashback') || desc.includes('bonus') || desc.includes('interest earned') ||
      desc.includes('received from') || desc.includes('credited')) {
    return 'income';
  }
  if (desc.includes('paid to') || desc.includes('debited') || desc.includes('purchase') ||
      desc.includes('withdrawal') || desc.includes('atm')) {
    return 'expense';
  }

  return signedAmount >= 0 ? 'income' : 'expense';
}

// Detect columns from headers
function detectColumns(headers: string[]): {
  date: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
  type: number;
} {
  const headerLower = headers.map(h => h.toLowerCase().trim());

  let dateIdx = headerLower.findIndex(h =>
    ['date', 'transaction_date', 'trans_date', 'posted_date', 'tdate', 'txn date', 'value date'].includes(h)
  );
  if (dateIdx === -1) dateIdx = headerLower.findIndex(h => h.includes('date'));
  if (dateIdx === -1) dateIdx = 0;

  let descIdx = headerLower.findIndex(h =>
    ['description', 'desc', 'name', 'merchant', 'transaction', 'details', 'memo', 'narration', 'particulars', 'remarks'].includes(h)
  );
  if (descIdx === -1) descIdx = headerLower.findIndex(h => h.includes('desc') || h.includes('narr') || h.includes('particular') || h.includes('detail'));
  if (descIdx === -1) descIdx = 1;

  const debitIdx = headerLower.findIndex(h =>
    ['debit', 'withdrawal', 'withdrawal amt', 'withdrawal amount', 'dr', 'debit amount', 'paid out'].includes(h) ||
    h.includes('withdrawal') || h.includes('debit')
  );
  const creditIdx = headerLower.findIndex(h =>
    ['credit', 'deposit', 'deposit amt', 'deposit amount', 'cr', 'credit amount', 'paid in'].includes(h) ||
    h.includes('deposit') || h.includes('credit')
  );

  let amountIdx = headerLower.findIndex(h =>
    ['amount', 'amt', 'value', 'sum', 'transaction amount', 'txn amount'].includes(h)
  );
  if (amountIdx === -1) amountIdx = headerLower.findIndex(h => h.includes('amount') || h.includes('amt'));
  if (amountIdx === -1 && debitIdx === -1 && creditIdx === -1) amountIdx = 2;

  const typeIdx = headerLower.findIndex(h =>
    ['type', 'txn type', 'transaction type', 'dr/cr', 'cr/dr', 'drcr'].includes(h) ||
    h.includes('dr/cr') || h.includes('cr/dr')
  );

  return { date: dateIdx, description: descIdx, amount: amountIdx, debit: debitIdx, credit: creditIdx, type: typeIdx };
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
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          setProgress(25);

          // Parse CSV locally
          const lines = content.trim().split('\n');
          const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
          
          setProgress(50);

          const columnMapping = detectColumns(headers);
          const transactions: ParsedTransaction[] = [];
          const errors: string[] = [];

          for (let i = 1; i < lines.length; i++) {
            try {
              const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
              if (values.length < 3) continue;

              const dateField = values[columnMapping.date] || '';
              const descriptionField = values[columnMapping.description] || '';
              const amountField = values[columnMapping.amount] || '';

              if (!dateField || !amountField) continue;

              // Parse date
              let transactionDate: string;
              try {
                const parsedDate = new Date(dateField);
                if (isNaN(parsedDate.getTime())) {
                  const parts = dateField.split(/[\/\-\.]/);
                  if (parts.length === 3) {
                    const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
                    transactionDate = `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                  } else {
                    transactionDate = new Date().toISOString().split('T')[0];
                  }
                } else {
                  transactionDate = parsedDate.toISOString().split('T')[0];
                }
              } catch {
                transactionDate = new Date().toISOString().split('T')[0];
              }

              // Parse amount
              const cleanAmount = amountField.replace(/[$,₹€£\s]/g, '');
              const amount = Math.abs(parseFloat(cleanAmount));
              if (isNaN(amount) || amount === 0) continue;

              const transactionType = detectTransactionType(descriptionField, amountField);
              const category = categorizeTransaction(descriptionField);

              transactions.push({
                id: `local-${i}-${Date.now()}`,
                date: transactionDate,
                description: descriptionField || 'Transaction',
                amount,
                category,
                transaction_type: transactionType
              });
            } catch (err: any) {
              errors.push(`Row ${i + 1}: ${err.message}`);
            }
          }

          setProgress(75);

          // Remove duplicates
          const uniqueTransactions = transactions.filter((t, idx, self) =>
            idx === self.findIndex(x => 
              x.date === t.date && x.amount === t.amount && x.description === t.description
            )
          );

          setProgress(100);

          const categories = [...new Set(uniqueTransactions.map(t => t.category))];
          
          setResult({
            processed_transactions: uniqueTransactions.length,
            total_rows: lines.length - 1,
            duplicate_count: transactions.length - uniqueTransactions.length,
            categories_detected: categories,
            errors: errors.slice(0, 10)
          });

          toast({
            title: "File processed successfully!",
            description: `Parsed ${uniqueTransactions.length} transactions.`,
          });

          onUploadComplete?.(uniqueTransactions);

        } catch (err: any) {
          console.error('Processing error:', err);
          setError(err.message);
          toast({
            title: "Processing failed",
            description: err.message,
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

    } catch (err: any) {
      setError(err.message);
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
          Upload your bank statement CSV file to get started with AI-powered financial insights
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
                <p className="font-semibold">Processing completed successfully!</p>
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
                      {result.errors.slice(0, 3).map((err: string, index: number) => (
                        <li key={index}>• {err}</li>
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
        </div>
      </CardContent>
    </Card>
  );
};

export default FileUpload;
