import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  HeadBucketCommand,
  type CreateBucketCommandInput,
} from '@aws-sdk/client-s3';
import type { AwsResourceConfig } from '../mappers/sysml-to-resource.js';
import type { DeployResult, DestroyResult } from './types.js';

export function getS3BucketArn(bucketName: string): string {
  return `arn:aws:s3:::${bucketName}`;
}

export async function deployS3Bucket(
  config: AwsResourceConfig,
  region: string,
): Promise<DeployResult> {
  const bucketName = config.properties['bucketName'] as string;
  const client = new S3Client({ region });

  const input: CreateBucketCommandInput = { Bucket: bucketName };
  if (region !== 'us-east-1') {
    input.CreateBucketConfiguration = { LocationConstraint: region as never };
  }

  try {
    await client.send(new CreateBucketCommand(input));
  } catch (err) {
    const code = (err as { name?: string }).name;
    if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') throw err;
    // idempotent — bucket already exists and is owned by this account
  }

  return {
    resourceType: 'AWS::S3::Bucket',
    resourceId:   bucketName,
    arn:          getS3BucketArn(bucketName),
    region,
    deployedAt:   Date.now(),
  };
}

export async function destroyS3Bucket(
  bucketName: string,
  region: string,
): Promise<DestroyResult> {
  const client = new S3Client({ region });

  // check existence first — not an error if already gone
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
  } catch {
    return { resourceType: 'AWS::S3::Bucket', resourceId: bucketName, destroyedAt: Date.now() };
  }

  await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
  return { resourceType: 'AWS::S3::Bucket', resourceId: bucketName, destroyedAt: Date.now() };
}
