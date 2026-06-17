import {
  IAMClient,
  CreateRoleCommand,
  DeleteRoleCommand,
  GetRoleCommand,
} from '@aws-sdk/client-iam';
import type { AwsResourceConfig } from '../mappers/sysml-to-resource.js';
import type { DeployResult, DestroyResult } from './types.js';

export async function deployIamRole(
  config: AwsResourceConfig,
  assumeRolePolicyDocument: object,
): Promise<DeployResult> {
  const client = new IAMClient({});
  const roleName = config.properties['roleName'] as string;

  try {
    const result = await client.send(new CreateRoleCommand({
      RoleName:                 roleName,
      AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicyDocument),
    }));
    const role = result.Role!;
    return {
      resourceType: 'AWS::IAM::Role',
      resourceId:   roleName,
      arn:          role.Arn!,
      region:       'global',
      deployedAt:   Date.now(),
    };
  } catch (err) {
    if ((err as { name?: string }).name === 'EntityAlreadyExists') {
      const existing = await client.send(new GetRoleCommand({ RoleName: roleName }));
      return {
        resourceType: 'AWS::IAM::Role',
        resourceId:   roleName,
        arn:          existing.Role!.Arn!,
        region:       'global',
        deployedAt:   Date.now(),
      };
    }
    throw err;
  }
}

export async function destroyIamRole(roleName: string): Promise<DestroyResult> {
  const client = new IAMClient({});
  try {
    await client.send(new DeleteRoleCommand({ RoleName: roleName }));
  } catch (err) {
    if ((err as { name?: string }).name !== 'NoSuchEntity') throw err;
  }
  return { resourceType: 'AWS::IAM::Role', resourceId: roleName, destroyedAt: Date.now() };
}
