import * as tf from "@tensorflow/tfjs";
import { ParsedTransaction } from "@/components/FileUpload";

export interface AnomalyResult {
  txn: ParsedTransaction;
  score: number; // 0..1 anomaly probability (higher = more anomalous)
  reconstructionError: number;
  reasons: string[];
  risk: "Low" | "Medium" | "High";
}

/**
 * Build a numeric feature vector for each transaction.
 * Features: [amount_norm, log_amount, day_of_week/6, day_of_month/31,
 *            month/11, category_one_hot..., merchant_freq_norm, amount_vs_cat_avg]
 */
function buildFeatures(transactions: ParsedTransaction[]) {
  const expenses = transactions.filter((t) => t.transaction_type === "expense");
  const categories = Array.from(new Set(expenses.map((t) => t.category || "Other")));
  const catIndex: Record<string, number> = {};
  categories.forEach((c, i) => (catIndex[c] = i));

  // Category averages
  const catAgg: Record<string, { sum: number; count: number }> = {};
  expenses.forEach((t) => {
    const c = t.category || "Other";
    if (!catAgg[c]) catAgg[c] = { sum: 0, count: 0 };
    catAgg[c].sum += t.amount;
    catAgg[c].count += 1;
  });

  // Merchant frequency
  const merchantCount: Record<string, number> = {};
  expenses.forEach((t) => {
    const key = (t.description || "").toLowerCase().split(/\s+/).slice(0, 2).join(" ");
    merchantCount[key] = (merchantCount[key] || 0) + 1;
  });
  const maxMerchant = Math.max(1, ...Object.values(merchantCount));

  const amounts = expenses.map((t) => t.amount);
  const maxAmt = Math.max(1, ...amounts);
  const maxLog = Math.log(maxAmt + 1) || 1;

  const features: number[][] = expenses.map((t) => {
    const d = new Date(t.date);
    const dow = isNaN(d.getTime()) ? 0 : d.getDay();
    const dom = isNaN(d.getTime()) ? 0 : d.getDate();
    const mon = isNaN(d.getTime()) ? 0 : d.getMonth();
    const cat = t.category || "Other";
    const oneHot = new Array(categories.length).fill(0);
    oneHot[catIndex[cat]] = 1;
    const merchantKey = (t.description || "").toLowerCase().split(/\s+/).slice(0, 2).join(" ");
    const merchFreq = (merchantCount[merchantKey] || 1) / maxMerchant;
    const catAvg = catAgg[cat].sum / Math.max(1, catAgg[cat].count);
    const amtVsCat = catAvg > 0 ? Math.min(5, t.amount / catAvg) / 5 : 0;

    return [
      t.amount / maxAmt,
      Math.log(t.amount + 1) / maxLog,
      dow / 6,
      dom / 31,
      mon / 11,
      ...oneHot,
      merchFreq,
      amtVsCat,
    ];
  });

  return { expenses, features, categories, catAgg, merchantCount };
}

/**
 * Train a small autoencoder and return per-transaction reconstruction error
 * mapped to an anomaly probability in [0,1].
 */
export async function detectAnomaliesAutoencoder(
  transactions: ParsedTransaction[]
): Promise<AnomalyResult[]> {
  const { expenses, features, catAgg, merchantCount } = buildFeatures(transactions);
  if (expenses.length < 5 || features.length === 0) return [];

  const inputDim = features[0].length;
  const x = tf.tensor2d(features);

  // Tiny autoencoder
  const encodingDim = Math.max(2, Math.floor(inputDim / 3));
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [inputDim], units: Math.max(8, inputDim), activation: "relu" }));
  model.add(tf.layers.dense({ units: encodingDim, activation: "relu" }));
  model.add(tf.layers.dense({ units: Math.max(8, inputDim), activation: "relu" }));
  model.add(tf.layers.dense({ units: inputDim, activation: "sigmoid" }));
  model.compile({ optimizer: tf.train.adam(0.01), loss: "meanSquaredError" });

  const epochs = expenses.length < 50 ? 80 : expenses.length < 200 ? 50 : 30;
  await model.fit(x, x, { epochs, batchSize: Math.min(32, features.length), shuffle: true, verbose: 0 });

  const recon = model.predict(x) as tf.Tensor2D;
  const errors = tf.mean(tf.square(tf.sub(x, recon)), 1);
  const errArr = Array.from(await errors.data());

  x.dispose();
  recon.dispose();
  errors.dispose();
  model.dispose();

  // Normalize errors to 0..1 using min/max with percentile clipping
  const sorted = [...errArr].sort((a, b) => a - b);
  const minE = sorted[0];
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1];
  const range = Math.max(1e-9, p99 - minE);

  const results: AnomalyResult[] = expenses.map((t, i) => {
    const e = errArr[i];
    const score = Math.max(0, Math.min(1, (e - minE) / range));

    // Build human-readable reasons
    const reasons: string[] = [];
    const cat = t.category || "Other";
    const catAvg = catAgg[cat] ? catAgg[cat].sum / Math.max(1, catAgg[cat].count) : 0;
    if (catAvg > 0 && t.amount > catAvg * 2) {
      reasons.push(`${cat} spend is ${(t.amount / catAvg).toFixed(1)}× category average`);
    }
    const key = (t.description || "").toLowerCase().split(/\s+/).slice(0, 2).join(" ");
    if (merchantCount[key] === 1) {
      reasons.push(`Rare merchant: "${(t.description || "").slice(0, 30)}"`);
    }
    if (score >= 0.5) {
      reasons.push(`High autoencoder reconstruction error (${e.toExponential(2)})`);
    }
    if (reasons.length === 0) {
      reasons.push(`Unusual feature pattern (reconstruction error ${e.toExponential(2)})`);
    }

    const risk: "Low" | "Medium" | "High" =
      score >= 0.7 ? "High" : score >= 0.4 ? "Medium" : "Low";

    return { txn: t, score, reconstructionError: e, reasons, risk };
  });

  return results.sort((a, b) => b.score - a.score);
}
