import * as tf from "@tensorflow/tfjs";

// Min-max normalize series to [0, 1]. Returns normalized values + denorm fn.
function normalize(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const norm = values.map((v) => (v - min) / range);
  const denorm = (v: number) => v * range + min;
  return { norm, denorm, min, max, range };
}

// Build sequences of length `window` -> next value
function buildSequences(series: number[], window: number) {
  const xs: number[][][] = [];
  const ys: number[] = [];
  for (let i = 0; i + window < series.length; i++) {
    const seq = series.slice(i, i + window).map((v) => [v]);
    xs.push(seq);
    ys.push(series[i + window]);
  }
  return { xs, ys };
}

export interface LSTMForecastResult {
  predictions: number[];
  residualStd: number;
  modelUsed: "lstm" | "fallback-mean";
}

/**
 * Train a small LSTM on a univariate series and forecast `horizon` steps ahead.
 * Uses recursive multi-step prediction (feeds prediction back into the window).
 */
export async function lstmForecast(
  series: number[],
  horizon: number,
  opts: { window?: number; epochs?: number; units?: number } = {}
): Promise<LSTMForecastResult> {
  const cleaned = series.map((v) => (Number.isFinite(v) ? v : 0));

  // Need enough data to train: at least window+2 points.
  const window = Math.min(opts.window ?? 3, Math.max(2, cleaned.length - 2));
  if (cleaned.length < window + 2) {
    const mean = cleaned.reduce((a, b) => a + b, 0) / Math.max(1, cleaned.length);
    return {
      predictions: Array(horizon).fill(Math.max(0, mean)),
      residualStd: mean * 0.15,
      modelUsed: "fallback-mean",
    };
  }

  const { norm, denorm, range } = normalize(cleaned);
  const { xs, ys } = buildSequences(norm, window);

  if (xs.length === 0) {
    const mean = cleaned.reduce((a, b) => a + b, 0) / cleaned.length;
    return {
      predictions: Array(horizon).fill(Math.max(0, mean)),
      residualStd: mean * 0.15,
      modelUsed: "fallback-mean",
    };
  }

  const xTensor = tf.tensor3d(xs); // [samples, window, 1]
  const yTensor = tf.tensor2d(ys.map((v) => [v])); // [samples, 1]

  const units = opts.units ?? 16;
  const epochs = opts.epochs ?? 80;

  const model = tf.sequential();
  model.add(
    tf.layers.lstm({
      units,
      inputShape: [window, 1],
      activation: "tanh",
      recurrentActivation: "sigmoid",
    })
  );
  model.add(tf.layers.dense({ units: 1 }));
  model.compile({ optimizer: tf.train.adam(0.05), loss: "meanSquaredError" });

  await model.fit(xTensor, yTensor, {
    epochs,
    batchSize: Math.min(8, xs.length),
    verbose: 0,
    shuffle: true,
  });

  // Compute residual std on training data (in original scale)
  const trainPredTensor = model.predict(xTensor) as tf.Tensor;
  const trainPredArr = Array.from(await trainPredTensor.data());
  trainPredTensor.dispose();
  let sse = 0;
  for (let i = 0; i < ys.length; i++) {
    const p = denorm(trainPredArr[i]);
    const a = denorm(ys[i]);
    sse += (p - a) ** 2;
  }
  const residualStd = Math.sqrt(sse / Math.max(1, ys.length));

  // Recursive forecast
  const predictions: number[] = [];
  let currentWindow = norm.slice(-window);
  for (let i = 0; i < horizon; i++) {
    const inp = tf.tensor3d([currentWindow.map((v) => [v])]);
    const out = model.predict(inp) as tf.Tensor;
    const val = (await out.data())[0];
    inp.dispose();
    out.dispose();
    predictions.push(Math.max(0, denorm(val)));
    currentWindow = [...currentWindow.slice(1), val];
  }

  xTensor.dispose();
  yTensor.dispose();
  model.dispose();

  return {
    predictions,
    residualStd: residualStd || range * 0.1,
    modelUsed: "lstm",
  };
}
