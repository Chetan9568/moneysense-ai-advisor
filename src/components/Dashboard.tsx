import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, Upload, AlertTriangle, Brain, DollarSign, CreditCard, PiggyBank } from "lucide-react";

const Dashboard = () => {
  // Mock data for demonstrations
  const expenseData = [
    { month: 'Jan', expenses: 2400, forecast: 2500, income: 4000 },
    { month: 'Feb', expenses: 1398, forecast: 2200, income: 4000 },
    { month: 'Mar', expenses: 9800, forecast: 2800, income: 4000 },
    { month: 'Apr', expenses: 3908, forecast: 2600, income: 4000 },
    { month: 'May', expenses: 4800, forecast: 3200, income: 4000 },
    { month: 'Jun', expenses: 3800, forecast: 3000, income: 4000 },
  ];

  const categoryData = [
    { name: 'Food & Dining', value: 1200, color: '#3b82f6' },
    { name: 'Transportation', value: 800, color: '#10b981' },
    { name: 'Entertainment', value: 600, color: '#f59e0b' },
    { name: 'Shopping', value: 900, color: '#ef4444' },
    { name: 'Utilities', value: 400, color: '#8b5cf6' },
  ];

  const anomalies = [
    { id: 1, date: '2024-01-15', amount: 2500, merchant: 'Unknown Charge', risk: 'High' },
    { id: 2, date: '2024-01-14', amount: 850, merchant: 'ATM Withdrawal', risk: 'Medium' },
    { id: 3, date: '2024-01-13', amount: 450, merchant: 'Gas Station XYZ', risk: 'Low' },
  ];

  return (
    <section id="dashboard" className="py-20 bg-finance-background/30">
      <div className="container px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Your <span className="bg-gradient-primary bg-clip-text text-transparent">Financial Dashboard</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Get comprehensive insights into your spending patterns with AI-powered analysis
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-card border-0 shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Balance</p>
                  <p className="text-2xl font-bold text-success">$12,450</p>
                </div>
                <DollarSign className="h-8 w-8 text-success" />
              </div>
              <div className="flex items-center mt-4 text-xs text-success">
                <TrendingUp className="h-3 w-3 mr-1" />
                +12.5% from last month
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-0 shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Monthly Expenses</p>
                  <p className="text-2xl font-bold text-destructive">$3,240</p>
                </div>
                <CreditCard className="h-8 w-8 text-destructive" />
              </div>
              <div className="flex items-center mt-4 text-xs text-destructive">
                <TrendingDown className="h-3 w-3 mr-1" />
                +8.2% from forecast
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-0 shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Savings Goal</p>
                  <p className="text-2xl font-bold text-primary">$8,900</p>
                </div>
                <PiggyBank className="h-8 w-8 text-primary" />
              </div>
              <div className="flex items-center mt-4 text-xs text-success">
                <TrendingUp className="h-3 w-3 mr-1" />
                74% of $12,000 goal
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-0 shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">AI Confidence</p>
                  <p className="text-2xl font-bold text-accent">94.8%</p>
                </div>
                <Brain className="h-8 w-8 text-accent" />
              </div>
              <div className="flex items-center mt-4 text-xs text-accent">
                <TrendingUp className="h-3 w-3 mr-1" />
                High accuracy predictions
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          {/* Expense Forecast Chart */}
          <Card className="bg-gradient-card border-0 shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Expense Forecast
              </CardTitle>
              <CardDescription>
                AI-powered predictions for your next 6 months
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={expenseData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="expenses" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="forecast" stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Category Breakdown */}
          <Card className="bg-gradient-card border-0 shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5 text-accent" />
                Spending Categories
              </CardTitle>
              <CardDescription>
                Your monthly expense breakdown
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={120}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Anomaly Detection */}
        <Card className="bg-gradient-card border-0 shadow-card mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Anomaly Detection
            </CardTitle>
            <CardDescription>
              Suspicious transactions flagged by our AI system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {anomalies.map((anomaly) => (
                <div key={anomaly.id} className="flex items-center justify-between p-4 bg-background rounded-lg border">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${
                      anomaly.risk === 'High' ? 'bg-destructive' : 
                      anomaly.risk === 'Medium' ? 'bg-warning' : 'bg-success'
                    }`}></div>
                    <div>
                      <p className="font-medium">${anomaly.amount} - {anomaly.merchant}</p>
                      <p className="text-sm text-muted-foreground">{anomaly.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      anomaly.risk === 'High' ? 'bg-destructive/10 text-destructive' : 
                      anomaly.risk === 'Medium' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
                    }`}>
                      {anomaly.risk} Risk
                    </span>
                    <Button variant="outline" size="sm">Review</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upload Section */}
        <Card className="bg-gradient-primary text-white border-0 shadow-elevated">
          <CardContent className="p-8 text-center">
            <Upload className="h-12 w-12 mx-auto mb-4 opacity-90" />
            <h3 className="text-2xl font-bold mb-2">Ready to Get Started?</h3>
            <p className="mb-6 opacity-90">
              Upload your bank statements or transaction CSV files to begin your AI-powered financial analysis
            </p>
            <Button variant="secondary" size="lg" className="bg-white text-primary hover:bg-white/90">
              Upload Your Data
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default Dashboard;