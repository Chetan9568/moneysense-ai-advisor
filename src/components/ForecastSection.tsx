import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  Area, ComposedChart, BarChart, Bar,
} from "recharts";
import { TrendingUp, TrendingDown, AlertTriangle, Sparkles, Brain, IndianRupee, Target, Loader2 } from "lucide-react";
import { ParsedTransaction } from "@/components/FileUpload";
import { lstmForecast } from "@/lib/lstmForecast";

interface Props {
  transactions: ParsedTransaction[];
}

type Horizon = 1 | 3 | 6;

const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

// Aggregate transactions by month key YYYY-MM
function aggregateMonthly(transactions: ParsedTransaction[]) {
  const map: Record<string, { expenses: number; income: number; byCategory: Record<string, number> }> = {};
  transactions.forEach((t) => {
    const d = new Date(t.date);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!map[key]) map[key] = { expenses: 0, income: 0, byCategory: {} };
    if (t.transaction_type === "expense") {
      map[key].expenses += t.amount;
      const cat = t.category || "Other";
      map[key].byCategory[cat] = (map[key].byCategory[cat] || 0) + t.amount;
    } else {
      map[key].income += t.amount;
    }
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({ key, ...v }));
}

// Simple linear regression: returns slope, intercept, residual std
function linearRegression(values: number[]) {
  const n = values.length;
  if (n === 0) return { slope: 0, intercept: 0, std: 0, mean: 0 };
  const xs = values.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (values[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  // residual std
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i];
    sse += (values[i] - pred) ** 2;
  }
  const std = n > 1 ? Math.sqrt(sse / Math.max(1, n - 1)) : meanY * 0.1;
  return { slope, intercept, std, mean: meanY };
}

function nextMonthKey(key: string, offset: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shortMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[m - 1]} ${String(y).slice(2)}`;
}

const ForecastSection = ({ transactions }: Props) => {
  const [horizon, setHorizon] = useState<Horizon>(3);
  const [isTraining, setIsTraining] = useState(false);
  const [forecastResult, setForecastResult] = useState<{
    chartData: any[];
    totals: any;
    categoryForecasts: any[];
    insights: string[];
    alerts: { level: "warning" | "info"; message: string }[];
    modelUsed: string;
  } | null>(null);

  const monthly = useMemo(() => aggregateMonthly(transactions), [transactions]);

  const anomalyMonths = useMemo(() => {
    const set = new Set<string>();
    const expenses = transactions.filter((t) => t.transaction_type === "expense");
    if (expenses.length < 3) return set;
    const amounts = expenses.map((t) => t.amount);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const std = Math.sqrt(amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length);
    expenses.forEach((t) => {
      const z = std > 0 ? (t.amount - mean) / std : 0;
      if (z > 2) {
        const d = new Date(t.date);
        if (!isNaN(d.getTime())) {
          set.add(shortMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`));
        }
      }
    });
    return set;
  }, [transactions]);

  const hasEnoughData = monthly.length >= 2;

  useEffect(() => {
    let cancelled = false;
    if (!hasEnoughData) {
      setForecastResult(null);
      return;
    }

    (async () => {
      setIsTraining(true);
      try {
        const expensesSeries = monthly.map((m) => m.expenses);
        const incomeSeries = monthly.map((m) => m.income);

        // Train LSTM models for expenses and income
        const [expRes, incRes] = await Promise.all([
          lstmForecast(expensesSeries, horizon),
          lstmForecast(incomeSeries, horizon),
        ]);

        const lastKey = monthly[monthly.length - 1].key;
        const history = monthly.map((m) => ({
          month: shortMonth(m.key),
          actualExpense: Math.round(m.expenses),
          actualIncome: Math.round(m.income),
          forecastExpense: null as number | null,
          forecastIncome: null as number | null,
          lower: null as number | null,
          upper: null as number | null,
        }));

        const future: any[] = [];
        for (let i = 0; i < horizon; i++) {
          const predExp = expRes.predictions[i];
          const predInc = incRes.predictions[i];
          const band = 1.96 * (expRes.residualStd || predExp * 0.15);
          future.push({
            month: shortMonth(nextMonthKey(lastKey, i + 1)),
            actualExpense: null,
            actualIncome: null,
            forecastExpense: Math.round(predExp),
            forecastIncome: Math.round(predInc),
            lower: Math.round(Math.max(0, predExp - band)),
            upper: Math.round(predExp + band),
          });
        }
        const chartData = [...history, ...future];

        const totalForecastExpense = future.reduce((s, f) => s + (f.forecastExpense || 0), 0);
        const totalForecastIncome = future.reduce((s, f) => s + (f.forecastIncome || 0), 0);
        const expectedSavings = totalForecastIncome - totalForecastExpense;
        const nextMonthExpense = future[0]?.forecastExpense || 0;
        const nextMonthIncome = future[0]?.forecastIncome || 0;

        // Category-wise: train a small LSTM per category (limit to top 8 by total to keep it snappy)
        const allCategories = new Set<string>();
        monthly.forEach((m) => Object.keys(m.byCategory).forEach((c) => allCategories.add(c)));
        const categoryTotals = Array.from(allCategories).map((cat) => ({
          cat,
          total: monthly.reduce((s, m) => s + (m.byCategory[cat] || 0), 0),
        }));
        const topCats = categoryTotals.sort((a, b) => b.total - a.total).slice(0, 8).map((c) => c.cat);

        const catResults = await Promise.all(
          topCats.map(async (cat) => {
            const series = monthly.map((m) => m.byCategory[cat] || 0);
            const res = await lstmForecast(series, horizon, { epochs: 60, units: 8 });
            const recent = series.slice(-3);
            const recentAvg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
            const earlier = series.slice(0, Math.max(1, series.length - 3));
            const earlierAvg = earlier.reduce((a, b) => a + b, 0) / Math.max(1, earlier.length);
            const nextPred = res.predictions[0] || 0;
            const horizonPred = res.predictions[res.predictions.length - 1] || 0;
            const changePct = earlierAvg > 0 ? ((recentAvg - earlierAvg) / earlierAvg) * 100 : 0;
            let trend: "high-risk" | "stable" | "decreasing" = "stable";
            if (changePct > 15) trend = "high-risk";
            else if (changePct < -10) trend = "decreasing";
            return {
              category: cat,
              nextPred,
              horizonPred,
              changePct,
              trend,
              totalForecast: res.predictions.reduce((a, b) => a + b, 0),
            };
          })
        );
        const categoryForecasts = catResults.sort((a, b) => b.nextPred - a.nextPred);

        const insights: string[] = [];
        categoryForecasts.slice(0, 5).forEach((c) => {
          if (c.trend === "high-risk" && Math.abs(c.changePct) > 5) {
            insights.push(`Your ${c.category} spending is expected to increase by ${c.changePct.toFixed(0)}% next month.`);
          } else if (c.trend === "decreasing" && Math.abs(c.changePct) > 5) {
            insights.push(`Good news — ${c.category} spending is trending down by ${Math.abs(c.changePct).toFixed(0)}%.`);
          }
        });
        if (insights.length === 0) {
          insights.push("Your spending patterns look stable across categories.");
        }
        insights.unshift(
          `Forecast generated using an LSTM neural network trained on ${monthly.length} months of data.`
        );

        const alerts: { level: "warning" | "info"; message: string }[] = [];
        if (nextMonthIncome > 0 && nextMonthExpense > nextMonthIncome) {
          alerts.push({
            level: "warning",
            message: `⚠️ You are likely to overspend next month — predicted expenses ₹${formatINR(nextMonthExpense)} exceed predicted income ₹${formatINR(nextMonthIncome)}.`,
          });
        }
        const overspendMonths = future.filter((f) => f.forecastIncome > 0 && f.forecastExpense > f.forecastIncome).length;
        if (overspendMonths >= 2) {
          alerts.push({
            level: "warning",
            message: `⚠️ Predicted overspending in ${overspendMonths} of the next ${horizon} months.`,
          });
        }

        if (!cancelled) {
          setForecastResult({
            chartData,
            totals: { nextMonthExpense, nextMonthIncome, totalForecastExpense, totalForecastIncome, expectedSavings },
            categoryForecasts,
            insights,
            alerts,
            modelUsed: expRes.modelUsed,
          });
        }
      } catch (e) {
        console.error("LSTM forecast failed:", e);
      } finally {
        if (!cancelled) setIsTraining(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [monthly, horizon, hasEnoughData]);

  const chartData = forecastResult?.chartData ?? [];
  const totals = forecastResult?.totals;
  const categoryForecasts = forecastResult?.categoryForecasts ?? [];
  const insights = forecastResult?.insights ?? [];
  const alerts = forecastResult?.alerts ?? [];

  if (transactions.length === 0) return null;

  return (
    <section id="forecast" className="py-20">
      <div className="container px-4">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" /> Future Insights
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Predict Your <span className="bg-gradient-primary bg-clip-text text-transparent">Future Expenses</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            AI-powered forecasts based on your historical spending patterns with confidence intervals.
          </p>
        </div>

        {!hasEnoughData ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Not enough data</AlertTitle>
            <AlertDescription>
              We need at least 2 months of transactions to generate accurate forecasts. Upload more data to unlock predictions.
            </AlertDescription>
          </Alert>
        ) : !forecastResult || isTraining ? (
          <Card className="bg-gradient-card border-0 shadow-card">
            <CardContent className="p-12 flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <div className="text-center">
                <p className="font-semibold">Training LSTM neural network…</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Learning patterns from your transaction history. This takes a few seconds.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Horizon selector */}
            <div className="flex justify-center gap-2 mb-8">
              {([1, 3, 6] as Horizon[]).map((h) => (
                <Button
                  key={h}
                  variant={horizon === h ? "default" : "outline"}
                  onClick={() => setHorizon(h)}
                >
                  Next {h} {h === 1 ? "Month" : "Months"}
                </Button>
              ))}
            </div>

            {/* Alerts */}
            {alerts.length > 0 && (
              <div className="space-y-3 mb-6">
                {alerts.map((a, i) => (
                  <Alert key={i} variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{a.message}</AlertDescription>
                  </Alert>
                ))}
              </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card className="bg-gradient-card border-0 shadow-card">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Expected Expense (Next Month)</p>
                      <p className="text-2xl font-bold text-destructive">₹{formatINR(totals.nextMonthExpense)}</p>
                    </div>
                    <IndianRupee className="h-8 w-8 text-destructive" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-card border-0 shadow-card">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Expected Savings ({horizon}m)</p>
                      <p className={`text-2xl font-bold ${totals.expectedSavings >= 0 ? "text-success" : "text-destructive"}`}>
                        ₹{formatINR(Math.abs(totals.expectedSavings))}
                      </p>
                    </div>
                    <Target className={`h-8 w-8 ${totals.expectedSavings >= 0 ? "text-success" : "text-destructive"}`} />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-card border-0 shadow-card">
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground mb-2">Top Future Spending Categories</p>
                  <div className="space-y-1">
                    {categoryForecasts.slice(0, 3).map((c, i) => (
                      <div key={c.category} className="flex justify-between text-sm">
                        <span className="font-medium">{i + 1}. {c.category}</span>
                        <span className="text-muted-foreground">₹{formatINR(c.nextPred)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Forecast line chart with confidence interval */}
            <Card className="bg-gradient-card border-0 shadow-card mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Expense Forecast — Next {horizon} {horizon === 1 ? "Month" : "Months"}
                </CardTitle>
                <CardDescription>
                  LSTM neural network forecast · Solid line = actual, dashed = predicted · Shaded band = 95% confidence interval
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="confBand" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.12} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      stroke="hsl(var(--muted-foreground))"
                      tickFormatter={(v) => `₹${formatINR(v)}`}
                      width={80}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ fontWeight: 600, color: "hsl(var(--foreground))" }}
                      formatter={(v: any, name: any) => (v == null ? ["-", name] : [`₹${formatINR(v)}`, name])}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    {/* Light confidence band */}
                    <Area type="monotone" dataKey="upper" stroke="none" fill="url(#confBand)" name="Confidence" legendType="none" activeDot={false} />
                    <Area type="monotone" dataKey="lower" stroke="none" fill="hsl(var(--background))" name="Confidence Lower" legendType="none" activeDot={false} />
                    {/* Solid lines = actual */}
                    <Line
                      type="monotone"
                      dataKey="actualExpense"
                      stroke="hsl(var(--destructive))"
                      strokeWidth={2.5}
                      name="Actual Expense"
                      connectNulls
                      dot={(props: any) => {
                        const { cx, cy, payload, index } = props;
                        if (cx == null || cy == null) return <g key={`dot-${index}`} />;
                        const isAnom = anomalyMonths.has(payload.month);
                        return isAnom ? (
                          <circle key={`dot-${index}`} cx={cx} cy={cy} r={6} fill="hsl(var(--destructive))" stroke="#fff" strokeWidth={2} />
                        ) : (
                          <circle key={`dot-${index}`} cx={cx} cy={cy} r={4} fill="hsl(var(--destructive))" stroke="#fff" strokeWidth={1.5} />
                        );
                      }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="actualIncome"
                      stroke="hsl(var(--success))"
                      strokeWidth={2.5}
                      name="Actual Income"
                      connectNulls
                      dot={{ r: 4, fill: "hsl(var(--success))", stroke: "#fff", strokeWidth: 1.5 }}
                      activeDot={{ r: 6 }}
                    />
                    {/* Dashed lines = predicted */}
                    <Line
                      type="monotone"
                      dataKey="forecastExpense"
                      stroke="hsl(var(--destructive))"
                      strokeWidth={2}
                      strokeDasharray="6 5"
                      name="Forecast Expense"
                      connectNulls
                      dot={{ r: 4, fill: "#fff", stroke: "hsl(var(--destructive))", strokeWidth: 2 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="forecastIncome"
                      stroke="hsl(var(--success))"
                      strokeWidth={2}
                      strokeDasharray="6 5"
                      name="Forecast Income"
                      connectNulls
                      dot={{ r: 4, fill: "#fff", stroke: "hsl(var(--success))", strokeWidth: 2 }}
                      activeDot={{ r: 6 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Category-wise forecast */}
            <div className="grid lg:grid-cols-2 gap-8 mb-8">
              <Card className="bg-gradient-card border-0 shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-accent" />
                    Category-wise Forecast (Next Month)
                  </CardTitle>
                  <CardDescription>Predicted spending by category</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={categoryForecasts.slice(0, 8).map((c) => ({ name: c.category, value: Math.round(c.nextPred) }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={70} />
                      <YAxis tickFormatter={(v) => `₹${formatINR(v)}`} />
                      <Tooltip formatter={(v: number) => `₹${formatINR(v)}`} />
                      <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-gradient-card border-0 shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-accent" />
                    Trend Detection
                  </CardTitle>
                  <CardDescription>Risk classification per category</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                  {categoryForecasts.map((c) => {
                    const badge =
                      c.trend === "high-risk"
                        ? { label: "High Risk", cls: "bg-destructive/15 text-destructive", Icon: TrendingUp }
                        : c.trend === "decreasing"
                        ? { label: "Decreasing", cls: "bg-success/15 text-success", Icon: TrendingDown }
                        : { label: "Stable", cls: "bg-muted text-muted-foreground", Icon: Target };
                    const Icon = badge.Icon;
                    return (
                      <div key={c.category} className="flex items-center justify-between p-3 rounded-lg border bg-background/50">
                        <div>
                          <p className="font-medium text-sm">{c.category}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.changePct >= 0 ? "+" : ""}{c.changePct.toFixed(1)}% vs earlier · ₹{formatINR(c.nextPred)} next month
                          </p>
                        </div>
                        <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${badge.cls}`}>
                          <Icon className="h-3 w-3" />
                          {badge.label}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            {/* Smart insights */}
            <Card className="bg-gradient-card border-0 shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Smart Insights
                </CardTitle>
                <CardDescription>AI-generated takeaways from your forecast</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {insights.map((ins, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-primary">•</span>
                      <span>{ins}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </section>
  );
};

export default ForecastSection;