import { z } from 'zod';
import type { ToolDefinition } from './types.js';

type InputSchema = ToolDefinition['inputSchema'];

function zodTypeToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // unwrap optional/nullable
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return zodTypeToJsonSchema(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) {
    return zodTypeToJsonSchema(schema._def.innerType as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' };
    if ((schema as z.ZodString)._def.description) result['description'] = (schema as z.ZodString)._def.description;
    return result;
  }
  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }
  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: (schema as z.ZodEnum<never>).options };
  }
  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodTypeToJsonSchema((schema as z.ZodArray<z.ZodTypeAny>).element) };
  }
  if (schema instanceof z.ZodObject) {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    const properties: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(shape)) {
      properties[key] = zodTypeToJsonSchema(val as z.ZodTypeAny);
    }
    return { type: 'object', properties };
  }
  return {};
}

export function zodSchemaToInputSchema(
  shape: Record<string, z.ZodTypeAny>,
): InputSchema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, val] of Object.entries(shape)) {
    properties[key] = zodTypeToJsonSchema(val);
    // add description at top level if present
    const desc = (val as z.ZodTypeAny & { _def?: { description?: string } })._def?.description;
    if (desc) (properties[key] as Record<string, unknown>)['description'] = desc;

    const isOptional = val instanceof z.ZodOptional
      || val instanceof z.ZodNullable
      || (val instanceof z.ZodDefault);
    if (!isOptional) required.push(key);
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}
