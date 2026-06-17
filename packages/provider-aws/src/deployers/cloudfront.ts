import {
  CloudFrontClient,
  CreateDistributionCommand,
  GetDistributionCommand,
  UpdateDistributionCommand,
  DeleteDistributionCommand,
} from '@aws-sdk/client-cloudfront';
import type { AwsResourceConfig } from '../mappers/sysml-to-resource.js';
import type { DeployResult, DestroyResult } from './types.js';

export async function deployCloudFrontDistribution(
  config: AwsResourceConfig,
  originDomainName: string,
  _region: string,
): Promise<DeployResult> {
  // CloudFront is global — region parameter is ignored for API calls
  const client = new CloudFrontClient({ region: 'us-east-1' });
  const comment = (config.properties['comment'] as string | undefined) ?? config.resourceType;

  const result = await client.send(new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference:    `mdk-${Date.now()}`,
      Comment:            comment,
      Enabled:            true,
      DefaultRootObject: 'index.html',
      Origins: {
        Quantity: 1,
        Items: [{
          Id:             'mdk-origin',
          DomainName:     originDomainName,
          S3OriginConfig: { OriginAccessIdentity: '' },
        }],
      },
      DefaultCacheBehavior: {
        TargetOriginId:       'mdk-origin',
        ViewerProtocolPolicy: 'redirect-to-https',
        CachePolicyId:        '658327ea-f89d-4fab-a63d-7e88639e58f6', // CachingOptimized managed policy
        AllowedMethods: {
          Quantity: 2,
          Items: ['GET', 'HEAD'],
          CachedMethods: { Quantity: 2, Items: ['GET', 'HEAD'] },
        },
        Compress: true,
      },
    },
  }));

  const dist = result.Distribution!;
  return {
    resourceType: 'AWS::CloudFront::Distribution',
    resourceId:   dist.Id!,
    arn:          dist.ARN!,
    region:       'global',
    deployedAt:   Date.now(),
  };
}

export async function destroyCloudFrontDistribution(
  distributionId: string,
  _region: string,
): Promise<DestroyResult> {
  const client = new CloudFrontClient({ region: 'us-east-1' });

  // Get current config + ETag
  const current = await client.send(new GetDistributionCommand({ Id: distributionId }));
  const etag = current.ETag!;
  const distConfig = current.Distribution!.DistributionConfig!;

  // Disable first (required before delete)
  if (distConfig.Enabled) {
    distConfig.Enabled = false;
    const updated = await client.send(new UpdateDistributionCommand({
      Id: distributionId, IfMatch: etag, DistributionConfig: distConfig,
    }));
    await client.send(new DeleteDistributionCommand({
      Id: distributionId, IfMatch: updated.ETag!,
    }));
  } else {
    await client.send(new DeleteDistributionCommand({ Id: distributionId, IfMatch: etag }));
  }

  return { resourceType: 'AWS::CloudFront::Distribution', resourceId: distributionId, destroyedAt: Date.now() };
}
