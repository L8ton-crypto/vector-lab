// Simple PCA for 2D projection of high-dimensional vectors

export function projectTo2D(vectors: number[][]): { x: number; y: number }[] {
  if (vectors.length === 0) return [];
  if (vectors.length === 1) return [{ x: 0, y: 0 }];

  const dim = vectors[0].length;
  const n = vectors.length;

  // Center the data
  const mean = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let d = 0; d < dim; d++) mean[d] += v[d];
  }
  for (let d = 0; d < dim; d++) mean[d] /= n;

  const centered = vectors.map((v) => v.map((val, d) => val - mean[d]));

  // Power iteration to find top 2 principal components
  const pc1 = powerIteration(centered, dim);
  
  // Deflate and find second component
  const deflated = centered.map((v) => {
    const proj = dot(v, pc1);
    return v.map((val, d) => val - proj * pc1[d]);
  });
  const pc2 = powerIteration(deflated, dim);

  // Project onto PCs
  return centered.map((v) => ({
    x: dot(v, pc1),
    y: dot(v, pc2),
  }));
}

function powerIteration(data: number[][], dim: number, iterations = 50): number[] {
  let vec = new Array(dim).fill(0).map(() => Math.random() - 0.5);
  let norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  vec = vec.map((v) => v / norm);

  for (let iter = 0; iter < iterations; iter++) {
    const newVec = new Array(dim).fill(0);
    for (const row of data) {
      const d = dot(row, vec);
      for (let i = 0; i < dim; i++) newVec[i] += d * row[i];
    }
    norm = Math.sqrt(newVec.reduce((s, v) => s + v * v, 0));
    if (norm === 0) return vec;
    vec = newVec.map((v) => v / norm);
  }

  return vec;
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}
