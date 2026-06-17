export interface Stage {
  name: string;
  pass: boolean;
  note?: string;
  issues?: Array<{ path: string; message: string; code?: string }>;
}

export function zodIssues(err: { issues: Array<{ path: unknown[]; message: string; code: string }> }): Stage['issues'] {
  return err.issues.map(i => ({
    path:    (i.path ?? []).join('.') || '(root)',
    message: i.message,
    code:    i.code,
  }));
}
