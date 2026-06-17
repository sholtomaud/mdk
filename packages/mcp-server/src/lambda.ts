/*
 * Lambda handler stub — T10.2 implements this fully.
 *
 * Pattern: use StreamableHTTPServerTransport (MCP SDK >= 1.10) which is
 * designed for stateless serverless environments. Each invocation gets a
 * fresh transport; no persistent SSE connection is required.
 *
 * The WASM kernel is loaded from path.resolve(__dirname, 'kernel.wasm'),
 * bundled alongside this JS file in the Lambda deployment package.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

export async function handler(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  return {
    statusCode: 501,
    body: JSON.stringify({ error: 'Lambda handler not yet implemented — see T10.2' }),
  };
}
