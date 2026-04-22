import { useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Upload, AlertTriangle, Brain, IndianRupee, CreditCard, PiggyBank } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ParsedTransaction } from "@/components/FileUpload";

interface DashboardProps {
  transactions?: ParsedTransaction[];
  onFileUpload?: () => void;
}

interface CategoryData {
  name: string;
  value: number;
  color: string;
}

interface MonthlyData {
  month: string;
  expenses: number;
  income: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining': '#3b82f6',
  'Transportation': '#10b981',
  'Entertainment': '#f59e0b',
  'Shopping': '#ef4444',
  'Bills & Utilities': '#8b5cf6',
  'Healthcare': '#ec4899',
  'Housing': '#06b6d4',
  'Income': '#22c55e',
  'Transfer': '#6366f1',
  'Cash Withdrawal': '#f97316',
  'Other': '#64748b',
};

const Dashboard = ({ transactions = [], onFileUpload }: DashboardProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatINR = (n: number) =>
    new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const formatINRShort = (n: number) =>
    new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);

  // Calculate metrics from transactions
  const totalIncome = transactions
    .filter(t => t.transaction_type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = transactions
    .filter(t => t.transaction_type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = totalIncome - totalExpenses;

  // Get current month expenses
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthlyExpenses = transactions
    .filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear && t.transaction_type === 'expense';
    })
    .reduce((sum, t) => sum + t.amount, 0);

  // Category breakdown
  const categoryTotals: Record<string, number> = {};
  transactions
    .filter(t => t.transaction_type === 'expense')
    .forEach(t => {
      const cat = t.category || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + t.amount;
    });

  const categoryData: CategoryData[] = Object.entries(categoryTotals)
    .map(([name, value]) => ({
      name,
      value,
      color: CATEGORY_COLORS[name] || '#64748b',
    }))
    .sort((a, b) => b.value - a.value);

  // Monthly data for chart
  const monthlyDataMap: Record<string, { expenses: number; income: number }> = {};
  transactions.forEach(t => {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyDataMap[key]) {
      monthlyDataMap[key] = { expenses: 0, income: 0 };
    }
    if (t.transaction_type === 'expense') {
      monthlyDataMap[key].expenses += t.amount;
    } else {
      monthlyDataMap[key].income += t.amount;
    }
  });

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const expenseData: MonthlyData[] = Object.entries(monthlyDataMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, data]) => {
      const [, month] = key.split('-');
      return {
        month: monthNames[parseInt(month) - 1],
        expenses: Math.round(data.expenses),
        income: Math.round(data.income),
      };
    });

  const handleUploadClick = () => {
    onFileUpload?.();
  };

  const hasData = transactions.length > 0;

  return (
    <section id="dashboard" className="py-20 bg-finance-background/30">
      <div className="container px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Your <span className="bg-gradient-primary bg-clip-text text-transparent">Financial Dashboard</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            {hasData 
              ? `Analyzing ${transactions.length} transactions from your data`
              : "Upload your transaction data to see personalized insights"
            }
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-card border-0 shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Net Balance</p>
                  <p className={`text-2xl font-bold ${balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                    ₹{hasData ? formatINR(Math.abs(balance)) : '0.00'}
                  </p>
                </div>
                <IndianRupee className={`h-8 w-8 ${balance >= 0 ? 'text-success' : 'text-destructive'}`} />
              </div>
              <div className={`flex items-center mt-4 text-xs ${balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                {balance >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                {hasData ? (balance >= 0 ? 'Positive balance' : 'Negative balance') : 'No data yet'}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-0 shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Expenses</p>
                  <p className="text-2xl font-bold text-destructive">
                    ₹{hasData ? formatINR(totalExpenses) : '0.00'}
                  </p>
                </div>
                <CreditCard className="h-8 w-8 text-destructive" />
              </div>
              <div className="flex items-center mt-4 text-xs text-muted-foreground">
                This month: ₹{formatINR(monthlyExpenses)}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-0 shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Income</p>
                  <p className="text-2xl font-bold text-success">
                    ₹{hasData ? formatINR(totalIncome) : '0.00'}
                  </p>
                </div>
                <PiggyBank className="h-8 w-8 text-success" />
              </div>
              <div className="flex items-center mt-4 text-xs text-success">
                <TrendingUp className="h-3 w-3 mr-1" />
                {hasData ? `${transactions.filter(t => t.transaction_type === 'income').length} income transactions` : 'No income data'}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-0 shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Categories</p>
                  <p className="text-2xl font-bold text-accent">{categoryData.length}</p>
                </div>
                <Brain className="h-8 w-8 text-accent" />
              </div>
              <div className="flex items-center mt-4 text-xs text-accent">
                {hasData ? 'AI categorized' : 'Upload data to analyze'}
              </div>
            </CardContent>
          </Card>
        </div>

        {hasData && (
          <div className="grid lg:grid-cols-2 gap-8 mb-8">
            {/* Expense Chart */}
            <Card className="bg-gradient-card border-0 shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Monthly Overview
                </CardTitle>
                <CardDescription>
                  Your income vs expenses over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                {expenseData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={expenseData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                      <Bar dataKey="income" name="Income" fill="#22c55e" />
                      <Bar dataKey="expenses" name="Expenses" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Not enough data for chart
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Category Breakdown */}
            <Card className="bg-gradient-card border-0 shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-accent" />
                  Spending Categories
                </CardTitle>
                <CardDescription>
                  Your expense breakdown by category
                </CardDescription>
              </CardHeader>
              <CardContent>
                {categoryData.length > 0 ? (
                  <div className="flex flex-col lg:flex-row items-center gap-4">
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 w-full lg:w-auto">
                      {categoryData.slice(0, 5).map((cat, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                          <span className="truncate max-w-[120px]">{cat.name}</span>
                          <span className="text-muted-foreground ml-auto">${cat.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No expense data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Upload Section */}
        <Card className="bg-gradient-primary text-white border-0 shadow-elevated">
          <CardContent className="p-8 text-center">
            <Upload className="h-12 w-12 mx-auto mb-4 opacity-90" />
            <h3 className="text-2xl font-bold mb-2">
              {hasData ? "Upload More Data" : "Ready to Get Started?"}
            </h3>
            <p className="mb-6 opacity-90">
              {hasData 
                ? "Add more transaction files to enrich your analysis"
                : "Upload your bank statements or transaction CSV files to begin your AI-powered financial analysis"
              }
            </p>
            <Button variant="secondary" size="lg" className="bg-white text-primary hover:bg-white/90" onClick={handleUploadClick}>
              Upload Your Data
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default Dashboard;
