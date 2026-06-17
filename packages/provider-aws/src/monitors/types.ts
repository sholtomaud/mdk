export interface MetricQuery {
  resourceId:     string;
  resourceArn:    string;
  namespace:      string;
  metricName:     string;
  dimensionName:  string;
  dimensionValue: string;
  bgStateVariable: string;
  startTime:      Date;
  endTime:        Date;
  period:         number;
  stat:           'Average' | 'Sum' | 'Maximum' | 'Minimum' | 'SampleCount';
}

export interface MetricDataPoint {
  timestamp: Date;
  value:     number;
  unit:      string;
}

export interface MetricResult {
  query:          MetricQuery;
  dataPoints:     MetricDataPoint[];
  bgStateVariable: string;
}

export interface DivergenceResult {
  bgStateVariable: string;
  metricName:      string;
  simulatedValues: number[];
  actualValues:    number[];
  mse:             number;
  maxAbsError:     number;
  diverged:        boolean;
  threshold:       number;
}
