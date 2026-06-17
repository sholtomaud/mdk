export interface GenerateModelOpts {
  description: string;
  domain: 'bondgraph' | 'odum-esl' | 'sysml' | 'functional';
  correction_json?: string;
  scap_errors?: string;
  socratic_answers?: string;
}

export interface ExplainOpts {
  userMessage: string;
  validationResult: string;
  simResult: string;
  verifyResult?: string;
}

export interface LlmProvider {
  generateModel(opts: GenerateModelOpts): Promise<string>;
  explain(opts: ExplainOpts): Promise<string>;
}
