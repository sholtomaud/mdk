import {
  CloudWatchClient,
  GetMetricDataCommand,
  type MetricDataQuery,
} from '@aws-sdk/client-cloudwatch';
import type { MetricQuery, MetricResult, MetricDataPoint, DivergenceResult } from './types.js';

export async function queryMetrics(
  queries: MetricQuery[],
  region: string,
): Promise<MetricResult[]> {
  if (queries.length === 0) return [];

  const client = new CloudWatchClient({ region });

  const metricDataQueries: MetricDataQuery[] = queries.map((q, i) => ({
    Id:    `q${i}`,
    Label: `${q.metricName}_${q.resourceId}`,
    MetricStat: {
      Metric: {
        Namespace:  q.namespace,
        MetricName: q.metricName,
        Dimensions: [{ Name: q.dimensionName, Value: q.dimensionValue }],
      },
      Period: q.period,
      Stat:   q.stat,
    },
  }));

  const raw = await client.send(new GetMetricDataCommand({
    MetricDataQueries: metricDataQueries,
    StartTime:         queries[0]!.startTime,
    EndTime:           queries[0]!.endTime,
  }));

  return queries.map((q, i) => {
    const resultSet = raw.MetricDataResults?.find(r => r.Id === `q${i}`);
    const timestamps = resultSet?.Timestamps ?? [];
    const values     = resultSet?.Values ?? [];
    const dataPoints: MetricDataPoint[] = timestamps.map((ts, j) => ({
      timestamp: ts,
      value:     values[j] ?? 0,
      unit:      resultSet?.Label ?? q.metricName,
    }));
    return { query: q, dataPoints, bgStateVariable: q.bgStateVariable };
  });
}

export function computeDivergence(
  actual: MetricResult,
  simulatedValues: number[],
  threshold: number,
): DivergenceResult {
  const actualValues = actual.dataPoints.map(p => p.value);
  const len = Math.min(actualValues.length, simulatedValues.length);

  let sumSq = 0;
  let maxAbs = 0;
  for (let i = 0; i < len; i++) {
    const diff = Math.abs((actualValues[i] ?? 0) - (simulatedValues[i] ?? 0));
    sumSq += diff * diff;
    if (diff > maxAbs) maxAbs = diff;
  }

  const mse = len > 0 ? sumSq / len : 0;

  return {
    bgStateVariable: actual.bgStateVariable,
    metricName:      actual.query.metricName,
    simulatedValues: simulatedValues.slice(0, len),
    actualValues:    actualValues.slice(0, len),
    mse,
    maxAbsError: maxAbs,
    diverged:    maxAbs > threshold,
    threshold,
  };
}
