import type { LlmProvider, GenerateModelOpts, ExplainOpts } from './llm-provider.js';

export class MockLlmProvider implements LlmProvider {
  constructor(
    private readonly modelResponse: string,
    private readonly explainResponse: string = 'Mock explanation.',
  ) {}

  async generateModel(_opts: GenerateModelOpts): Promise<string> {
    return this.modelResponse;
  }

  async explain(_opts: ExplainOpts): Promise<string> {
    return this.explainResponse;
  }
}
