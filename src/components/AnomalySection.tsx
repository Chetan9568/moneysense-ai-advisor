import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, ShieldAlert, Sparkles } from "lucide-react";
import { ParsedTransaction } from "@/components/FileUpload";

interface Props {
  transactions: ParsedTransaction[];
}

type Risk = "Low" | "Medium" | "High";

interface Anomaly {
  txn: ParsedTransaction;
  score: number;
  reasons: string[];
  risk: Risk;
}

const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

function detectAnomalies(transactions: ParsedTransaction[]): Anomaly[] {
  const expenses = transactions.filter((t) => t.transaction_type === "expense");
  if (expenses.length < 3) return [];

  const amounts = expenses.map((t) => t.amount);
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const std = Math.sqrt(amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length);

  // Category averages
  const catTotals: Record<string, { sum: number; count: number; items: number[] }> = {};
  expenses.forEach((t) => {
    const c = t.category || "Other";
    if (!catTotals[c]) catTotals[c] = { sum: 0, count: 0, items: [] };
    catTotals[c].sum += t.amount;
    catTotals[c].count += 1;
    catTotals[c].items.push(t.amount);
  });

  // Merchant frequency from description (first 2 words)
  const merchantCount: Record<string, number> = {};
  expenses.forEach((t) => {
    const key = (t.description || "").toLowerCase().split(/\s+/).slice(0, 2).join(" ");
    merchantCount[key] = (merchantCount[key] || 0) + 1;
  });

  // Monthly category spending vs average
  const monthCat: Record<string, Record<string, number>> = {};
  expenses.forEach((t) => {
    const d = new Date(t.date);
    if (isNaN(d.getTime())) return;
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthCat[mk]) monthCat[mk] = {};
    const c = t.category || "Other";
    monthCat[mk][c] = (monthCat[mk][c] || 0) + t.amount;
  });

  const anomalies: Anomaly[] = [];

  expenses.forEach((t) => {
    const reasons: string[] = [];
    let score = 0;

    // 1. Z-score on amount
    const z = std > 0 ? (t.amount - mean) / std : 0;
    if (z > 2) {
      reasons.push(`Unusually high amount (${z.toFixed(1)}σ above average)`);
      score += Math.min(0.5, (z - 2) * 0.2 + 0.3);
    }

    // 2. Category spend > 2x category average per-transaction
    const cat = catTotals[t.category || "Other"];
    if (cat && cat.count > 1) {
      const catAvg = cat.sum / cat.count;
      if (t.amount > catAvg * 2) {
        reasons.push(`${t.category} spend is ${(t.amount / catAvg).toFixed(1)}× category average`);
        score += 0.25;
      }
    }

    // 3. Rare merchant (appears only once and amount above mean)
    const key = (t.description || "").toLowerCase().split(/\s+/).slice(0, 2).join(" ");
    if (merchantCount[key] === 1 && t.amount > mean) {
      reasons.push(`Rare merchant: "${(t.description || "").slice(0, 30)}"`);
      score += 0.15;
    }

    if (reasons.length > 0) {
      score = Math.min(1, score);
      const risk: Risk = score >= 0.7 ? "High" : score >= 0.4 ? "Medium" : "Low";
      anomalies.push({ txn: t, score, reasons, risk });
    }
  });

  return anomalies.sort((a, b) => b.score - a.score);
}

const AnomalySection = ({ transactions }: Props) => {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [onlyAnomalies, setOnlyAnomalies] = useState(true);

  const anomalies = useMemo(() => detectAnomalies(transactions), [transactions]);

  const categories = useMemo(() => {
    const set = new Set(anomalies.map((a) => a.txn.category || "Other"));
    return Array.from(set);
  }, [anomalies]);

  const filtered = useMemo(() => {
    return anomalies.filter((a) => {
      if (categoryFilter !== "all" && (a.txn.category || "Other") !== categoryFilter) return false;
      if (riskFilter !== "all" && a.risk !== riskFilter) return false;
      return true;
    });
  }, [anomalies, categoryFilter, riskFilter]);

  // Smart insights
  const insights = useMemo(() => {
    const list: string[] = [];
    if (anomalies.length === 0) return list;

    // Current month count
    const now = new Date();
    const thisMonth = anomalies.filter((a) => {
      const d = new Date(a.txn.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    if (thisMonth.length > 0) {
      list.push(`You had ${thisMonth.length} unusual transaction${thisMonth.length > 1 ? "s" : ""} this month.`);
    }

    // Category spike
    const expenses = transactions.filter((t) => t.transaction_type === "expense");
    const monthly: Record<string, Record<string, number>> = {};
    expenses.forEach((t) => {
      const d = new Date(t.date);
      if (isNaN(d.getTime())) return;
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthly[mk]) monthly[mk] = {};
      const c = t.category || "Other";
      monthly[mk][c] = (monthly[mk][c] || 0) + t.amount;
    });
    const months = Object.keys(monthly).sort();
    if (months.length >= 2) {
      const last = monthly[months[months.length - 1]];
      const prevMonths = months.slice(0, -1);
      Object.keys(last).forEach((c) => {
        const prevAvg = prevMonths.reduce((s, m) => s + (monthly[m][c] || 0), 0) / prevMonths.length;
        if (prevAvg > 0 && last[c] > prevAvg * 1.3) {
          const pct = (((last[c] - prevAvg) / prevAvg) * 100).toFixed(0);
          list.push(`${c} spending spike detected (+${pct}%).`);
        }
      });
    }
    return list.slice(0, 5);
  }, [anomalies, transactions]);

  if (transactions.length === 0) return null;

  const riskColor = (r: Risk) =>
    r === "High" ? "bg-destructive text-destructive-foreground" : r === "Medium" ? "bg-orange-500 text-white" : "bg-yellow-500 text-white";

  return (
    <section id="anomalies" className="py-20 bg-muted/20">
      <div className="container px-4">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-destructive/10 text-destructive text-sm font-medium mb-4">
            <ShieldAlert className="h-4 w-4" /> Anomaly Detection
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            🚨 Detect <span className="bg-gradient-primary bg-clip-text text-transparent">Suspicious Activity</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Z-score based detection flags unusual amounts, category spikes, and rare merchants.
          </p>
        </div>

        {anomalies.length === 0 ? (
          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertTitle>No anomalies found</AlertTitle>
            <AlertDescription>Your spending patterns look normal — no suspicious transactions detected.</AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Smart insights */}
            {insights.length > 0 && (
              <Card className="bg-gradient-card border-0 shadow-card mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-5 w-5 text-primary" /> Smart Insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {insights.map((ins, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span className="text-destructive">⚠️</span>
                        <span>{ins}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Filters */}
            <Card className="bg-gradient-card border-0 shadow-card mb-6">
              <CardContent className="p-4 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Category:</Label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Risk:</Label>
                  <Select value={riskFilter} onValueChange={setRiskFilter}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All risks</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Switch id="only-anom" checked={onlyAnomalies} onCheckedChange={setOnlyAnomalies} />
                  <Label htmlFor="only-anom" className="text-sm">Show anomalies only</Label>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card className="bg-gradient-card border-0 shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Flagged Transactions ({filtered.length})
                </CardTitle>
                <CardDescription>Hover the warning icon to see why each transaction was flagged.</CardDescription>
              </CardHeader>
              <CardContent>
                <TooltipProvider>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Risk</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(onlyAnomalies ? filtered : filtered).map((a, i) => (
                        <TableRow key={i} className="bg-destructive/5 hover:bg-destructive/10">
                          <TableCell className="text-sm">{a.txn.date}</TableCell>
                          <TableCell className="text-sm max-w-[220px] truncate">{a.txn.description}</TableCell>
                          <TableCell><Badge variant="outline">{a.txn.category}</Badge></TableCell>
                          <TableCell className="text-right font-semibold text-destructive">
                            ₹{formatINR(a.txn.amount)}
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1 text-sm cursor-help">
                                  <AlertTriangle className="h-4 w-4 text-destructive" />
                                  <span className="truncate max-w-[200px]">{a.reasons[0]}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <ul className="space-y-1 text-xs">
                                  {a.reasons.map((r, j) => <li key={j}>• {r}</li>)}
                                  <li className="pt-1 border-t mt-1">Anomaly score: {(a.score * 100).toFixed(0)}%</li>
                                </ul>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Badge className={riskColor(a.risk)}>{a.risk}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TooltipProvider>
                {filtered.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-6">No anomalies match the selected filters.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </section>
  );
};

export default AnomalySection;

// Export detector so other components (e.g. forecast chart) can mark anomalies
export { detectAnomalies };
export type { Anomaly };
