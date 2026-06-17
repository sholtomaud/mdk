import * as fs from 'fs';
import * as path from 'path';
import { validateBondGraph, BondGraphModel } from '@mdk/core';

export async function cmdValidate(): Promise<void> {
  /* Accept a pre-synthesised .mdk.json or a raw bondgraph JSON */
  const candidates = ['model.mdk.json', 'model.json'];
  let jsonFile: string | null = null;
  for (const f of candidates) {
    if (fs.existsSync(path.resolve(process.cwd(), f))) {
      jsonFile = path.resolve(process.cwd(), f);
      break;
    }
  }

  if (!jsonFile) {
    console.error('No model JSON found. Run mdk synth first, or provide a bondgraph JSON.');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(jsonFile, 'utf8')) as Record<string, unknown>;

  /* Handle both raw model and synthesised { model, result } envelope */
  const modelRaw = ('model' in raw) ? raw['model'] : raw;
  const parsed = BondGraphModel.safeParse(modelRaw);
  if (!parsed.success) {
    console.error('Schema validation failed:');
    parsed.error.issues.forEach(i => console.error(` ${i.path.join('.')}: ${i.message}`));
    process.exit(1);
  }

  const result = await validateBondGraph(parsed.data);

  if (result.success) {
    console.log('✓ Causality valid');
    result.causality?.bonds.forEach(b => {
      console.log(`  bond ${b.id}: src=${b.source_causality} tgt=${b.target_causality}`);
    });
  } else {
    console.error('✗ Causality errors:');
    result.causality?.diagnostics.forEach(d => {
      if (d.status === 'ERROR') console.error(`  [elem ${d.element_id}] ${d.message}`);
    });
    process.exit(1);
  }
}
