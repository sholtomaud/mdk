export interface CloudwatchMetricMapping {
  namespace:       string;
  metricName:      string;
  dimensionName:   string;
  bgStateVariable: string;
  unit:            string;
}

export interface AwsResourceConfig {
  resourceType:    string;
  sdkResourceType: 's3-bucket' | 'cloudfront-distribution' | 'iam-role' | 'lambda-function';
  properties:      Record<string, unknown>;
  bgElementType?:  'C' | 'R' | 'TF' | 'Se' | 'Sf' | 'I';
  cloudwatchMetrics: CloudwatchMetricMapping[];
}

const PATTERNS: Array<{ pattern: RegExp; config: (name: string) => AwsResourceConfig }> = [
  {
    pattern: /s3|bucket|storage|origin/i,
    config: (name) => ({
      resourceType:    'AWS::S3::Bucket',
      sdkResourceType: 's3-bucket',
      properties:      { bucketName: name.toLowerCase().replace(/[^a-z0-9-]/g, '-') },
      bgElementType:   'C',
      cloudwatchMetrics: [
        { namespace: 'AWS/S3', metricName: 'BucketSizeBytes',  dimensionName: 'BucketName', bgStateVariable: 'charge', unit: 'Bytes' },
        { namespace: 'AWS/S3', metricName: 'NumberOfObjects',  dimensionName: 'BucketName', bgStateVariable: 'count',  unit: 'Count' },
      ],
    }),
  },
  {
    pattern: /cloudfront|cdn|distribution|edge/i,
    config: (name) => ({
      resourceType:    'AWS::CloudFront::Distribution',
      sdkResourceType: 'cloudfront-distribution',
      properties:      { comment: name },
      bgElementType:   'R',
      cloudwatchMetrics: [
        { namespace: 'AWS/CloudFront', metricName: 'Requests',      dimensionName: 'DistributionId', bgStateVariable: 'flow',       unit: 'Count' },
        { namespace: 'AWS/CloudFront', metricName: 'OriginLatency', dimensionName: 'DistributionId', bgStateVariable: 'effort',     unit: 'Milliseconds' },
        { namespace: 'AWS/CloudFront', metricName: 'CacheHitRate',  dimensionName: 'DistributionId', bgStateVariable: 'efficiency', unit: 'Percent' },
        { namespace: 'AWS/CloudFront', metricName: 'BytesDownloaded', dimensionName: 'DistributionId', bgStateVariable: 'energy',   unit: 'Bytes' },
      ],
    }),
  },
  {
    pattern: /iam|role|policy/i,
    config: (name) => ({
      resourceType:    'AWS::IAM::Role',
      sdkResourceType: 'iam-role',
      properties:      { roleName: name.replace(/[^a-zA-Z0-9+=,.@_/-]/g, '-') },
      bgElementType:   undefined,
      cloudwatchMetrics: [],
    }),
  },
  {
    pattern: /lambda|function|handler/i,
    config: (name) => ({
      resourceType:    'AWS::Lambda::Function',
      sdkResourceType: 'lambda-function',
      properties:      { functionName: name.toLowerCase().replace(/[^a-z0-9-_]/g, '-') },
      bgElementType:   'TF',
      cloudwatchMetrics: [
        { namespace: 'AWS/Lambda', metricName: 'Invocations', dimensionName: 'FunctionName', bgStateVariable: 'flow',   unit: 'Count' },
        { namespace: 'AWS/Lambda', metricName: 'Duration',    dimensionName: 'FunctionName', bgStateVariable: 'effort', unit: 'Milliseconds' },
        { namespace: 'AWS/Lambda', metricName: 'Errors',      dimensionName: 'FunctionName', bgStateVariable: 'loss',   unit: 'Count' },
      ],
    }),
  },
];

export function mapPartUsageToAws(partUsageName: string): AwsResourceConfig | null {
  for (const { pattern, config } of PATTERNS) {
    if (pattern.test(partUsageName)) return config(partUsageName);
  }
  return null;
}

export function mapSysmlPackageToAws(
  elements: Array<{ '@type': string; name?: string }>,
): AwsResourceConfig[] {
  return elements
    .filter(el => el['@type'] === 'PartUsage' && el.name)
    .map(el => mapPartUsageToAws(el.name!))
    .filter((c): c is AwsResourceConfig => c !== null);
}
