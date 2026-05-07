import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Brain, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { ParsedTransaction } from "@/components/FileUpload";
import { detectAnomaliesAutoencoder, AnomalyResult } from "@/lib/autoencoderAnomaly";

interface Props {
  transactions: ParsedTransaction[];
}

const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

const AnomalySection = ({ transactions }: Props) => {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [onlyAnomalies, setOnlyAnomalies] = useState(true);
  const [results, setResults] = useState<AnomalyResult[]>([]);
  const [isTraining, setIsTraining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (transactions.length === 0) {
      setResults([]);
      return;
    }
    setIsTraining(true);
    detectAnomaliesAutoencoder(transactions)
      .then((res) => {
        if (!cancelled) setResults(res);
      })
      .catch((e) => {
        console.error("Autoencoder error:", e);
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsTraining(false);
      });
    return () => {
      cancelled = true;
    };
  }, [transactions]);

  const anomalies = useMemo(
    () => results.filter((r) => r.score >= 0.4 || r.risk !== "Low"),
    [results]
  );

  const categories = useMemo(() => {
    const set = new Set(results.map((a) => a.txn.category || "Other"));
    return Array.from(set);
  }, [results]);

  const filtered = useMemo(() => {
    const base = onlyAnomalies ? anomalies : results;
    return base.filter((a) => {
      if (categoryFilter !== "all" && (a.txn.category || "Other") !== categoryFilter) return false;
      if (riskFilter !== "all" && a.risk !== riskFilter) return false;
      return true;
    });
  }, [anomalies, results, onlyAnomalies, categoryFilter, riskFilter]);

  const insights = useMemo(() => {
    const list: string[] = [];
    if (anomalies.length === 0) return list;
    const now = new Date();
    const thisMonth = anomalies.filter((a) => {
      const d = new Date(a.txn.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    if (thisMonth.length > 0) {
      list.push(`You had ${thisMonth.length} unusual transaction${thisMonth.length > 1 ? "s" : ""} this month.`);
    }
    const high = anomalies.filter((a) => a.risk === "High").length;
    if (high > 0) list.push(`${high} high-risk transaction${high > 1 ? "s" : ""} detected by the autoencoder.`);
    return list.slice(0, 5);
  }, [anomalies]);

  if (transactions.length === 0) return null;

  const riskColor = (r: "Low" | "Medium" | "High") =>
    r === "High"
      ? "bg-destructive text-destructive-foreground"
      : r === "Medium"
      ? "bg-orange-500 text-white"
      : "bg-yellow-500 text-white";

  const scoreColor = (s: number) =>
    s >= 0.7 ? "text-destructive" : s >= 0.4 ? "text-orange-500" : "text-muted-foreground";

  return (
    <section id="anomalies" className="py-20 bg-muted/20">
      <div className="container px-4">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-destructive/10 text-destructive text-sm font-medium mb-4">
            <Brain className="h-4 w-4" /> Autoencoder Anomaly Detection
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            🚨 Detect <span className="bg-gradient-primary bg-clip-text text-transparent">Suspicious Activity</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            A neural autoencoder learns your normal spending patterns and flags transactions
            with high reconstruction error as anomalies.
          </p>
        </div>

        {isTraining ? (
          <Card className="bg-gradient-card border-0 shadow-card">
            <CardContent className="py-12 flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Training autoencoder on your transaction patterns...
              </p>
            </CardContent>
          </Card>
        ) : results.length === 0 ? (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Not enough data</AlertTitle>
            <AlertDescription>Need at least 5 expense transactions to train the autoencoder.</AlertDescription>
          </Alert>
        ) : anomalies.length === 0 ? (
          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertTitle>No anomalies found</AlertTitle>
            <AlertDescription>
              The autoencoder reconstructed all your transactions cleanly — no suspicious patterns detected.
            </AlertDescription>
          </Alert>
        ) : (
          <>
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

            <Card className="bg-gradient-card border-0 shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Transactions ({filtered.length})
                </CardTitle>
                <CardDescription>
                  Anomaly score = autoencoder reconstruction error. Higher % means more anomalous.
                </CardDescription>
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
                        <TableHead className="w-[200px]">Anomaly Score</TableHead>
                        <TableHead>Risk</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((a, i) => {
                        const pct = Math.round(a.score * 100);
                        const isAnom = a.score >= 0.4;
                        return (
                          <TableRow key={i} className={isAnom ? "bg-destructive/5 hover:bg-destructive/10" : ""}>
                            <TableCell className="text-sm">{a.txn.date}</TableCell>
                            <TableCell className="text-sm max-w-[220px] truncate">{a.txn.description}</TableCell>
                            <TableCell><Badge variant="outline">{a.txn.category}</Badge></TableCell>
                            <TableCell className={`text-right font-semibold ${isAnom ? "text-destructive" : ""}`}>
                              ₹{formatINR(a.txn.amount)}
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-2 cursor-help">
                                    {isAnom && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className={`text-xs font-semibold ${scoreColor(a.score)}`}>
                                          {pct}% anomalous
                                        </span>
                                      </div>
                                      <Progress value={pct} className="h-1.5" />
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <ul className="space-y-1 text-xs">
                                    <li className="font-semibold">Anomaly Score: {pct}%</li>
                                    <li>This transaction is {pct}% anomalous</li>
                                    <li className="pt-1 border-t mt-1">Reconstruction error: {a.reconstructionError.toExponential(2)}</li>
                                    {a.reasons.map((r, j) => <li key={j}>• {r}</li>)}
                                  </ul>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              <Badge className={riskColor(a.risk)}>{a.risk}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TooltipProvider>
                {filtered.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-6">
                    No transactions match the selected filters.
                  </p>
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
