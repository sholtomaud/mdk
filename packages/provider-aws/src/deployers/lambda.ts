import {
  LambdaClient,
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  Runtime,
} from '@aws-sdk/client-lambda';
import type { AwsResourceConfig } from '../mappers/sysml-to-resource.js';
import type { DeployResult, DestroyResult } from './types.js';

export async function deployLambdaFunction(
  config: AwsResourceConfig,
  roleArn: string,
  zipBuffer: Buffer,
  region: string,
): Promise<DeployResult> {
  const client = new LambdaClient({ region });
  const functionName = config.properties['functionName'] as string;

  const result = await client.send(new CreateFunctionCommand({
    FunctionName: functionName,
    Runtime:      Runtime.nodejs20x,
    Role:         roleArn,
    Handler:      'index.handler',
    Code:         { ZipFile: zipBuffer },
  }));

  return {
    resourceType: 'AWS::Lambda::Function',
    resourceId:   functionName,
    arn:          result.FunctionArn!,
    region,
    deployedAt:   Date.now(),
  };
}

export async function destroyLambdaFunction(
  functionName: string,
  region: string,
): Promise<DestroyResult> {
  const client = new LambdaClient({ region });
  try {
    await client.send(new GetFunctionCommand({ FunctionName: functionName }));
    await client.send(new DeleteFunctionCommand({ FunctionName: functionName }));
  } catch (err) {
    if ((err as { name?: string }).name !== 'ResourceNotFoundException') throw err;
  }
  return { resourceType: 'AWS::Lambda::Function', resourceId: functionName, destroyedAt: Date.now() };
}
