import type { AwsResourceConfig } from '../mappers/sysml-to-resource.js';
import type { DeployOptions, DeployResult, DestroyResult } from './types.js';
import { deployS3Bucket, destroyS3Bucket } from './s3.js';
import { deployCloudFrontDistribution, destroyCloudFrontDistribution } from './cloudfront.js';
import { deployIamRole, destroyIamRole } from './iam.js';
import { deployLambdaFunction, destroyLambdaFunction } from './lambda.js';

export async function deployResource(
  config: AwsResourceConfig,
  opts: DeployOptions,
): Promise<DeployResult> {
  switch (config.sdkResourceType) {
    case 's3-bucket':
      return deployS3Bucket(config, opts.region);
    case 'cloudfront-distribution':
      return deployCloudFrontDistribution(config, opts.originDomainName ?? '', opts.region);
    case 'iam-role':
      return deployIamRole(config, opts.assumeRolePolicyDocument ?? { Version: '2012-10-17', Statement: [] });
    case 'lambda-function':
      return deployLambdaFunction(config, opts.lambdaRoleArn ?? '', opts.lambdaZipBuffer ?? Buffer.from(''), opts.region);
    default:
      throw new Error(`Unknown sdkResourceType: ${(config as AwsResourceConfig).sdkResourceType}`);
  }
}

export async function destroyResource(
  config: AwsResourceConfig,
  resourceId: string,
  opts: Pick<DeployOptions, 'region'>,
): Promise<DestroyResult> {
  switch (config.sdkResourceType) {
    case 's3-bucket':              return destroyS3Bucket(resourceId, opts.region);
    case 'cloudfront-distribution': return destroyCloudFrontDistribution(resourceId, opts.region);
    case 'iam-role':               return destroyIamRole(resourceId);
    case 'lambda-function':        return destroyLambdaFunction(resourceId, opts.region);
    default:
      throw new Error(`Unknown sdkResourceType: ${(config as AwsResourceConfig).sdkResourceType}`);
  }
}
