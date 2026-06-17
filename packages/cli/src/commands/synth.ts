import * as fs from 'fs';
import * as path from 'path';
import { runKernel } from '@mdk/core';
import type { BondGraphModel, OdumEslModel } from '@mdk/core';

export async function cmdSynth(opts: { output?: string; validate?: boolean }): Promise<void> {
  /* Locate the user's model file */
  const candidates = ['src/model.ts', 'model.ts'];
  let modelFile: string | null = null;
  for (const f of candidates) {
    if (fs.existsSync(path.resolve(process.cwd(), f))) {
      modelFile = path.resolve(process.cwd(), f);
      break;
    }
  }

  if (!modelFile) {
    console.error('No model file found. Expected src/model.ts or model.ts');
    process.exit(1);
  }

  /* Dynamic require — the project must be compiled first */
  let model: BondGraphModel | OdumEslModel;
  try {
    const mod = require(modelFile.replace(/\.ts$/, '.js').replace('/src/', '/dist/')) as
      { model: BondGraphModel | OdumEslModel };
    model = mod.model;
  } catch (err) {
    console.error('Failed to load compiled model. Run tsc first, then mdk synth.');
    console.error((err as Error).message);
    process.exit(1);
  }

  if (opts.validate) {
    console.log('Validating model schema...');
  }

  let result;
  try {
    result = await runKernel(model);
  } catch (err) {
    console.error('Kernel error:', (err as Error).message);
    process.exit(1);
  }

  const outPath = opts.output ?? 'model.mdk.json';
  const payload = { model, result };
  fs.writeFileSync(path.resolve(process.cwd(), outPath), JSON.stringify(payload, null, 2));

  if (result.success) {
    console.log(`✓ Synthesis complete → ${outPath}`);
    if (result.state_space) {
      console.log(`  State-space: n=${result.state_space.state_count}, m=${result.state_space.input_count}`);
    }
  } else {
    console.error('✗ Causality errors detected:');
    result.causality?.diagnostics.forEach(d => {
      if (d.status === 'ERROR') console.error(`  [${d.element_id}] ${d.message}`);
    });
    process.exit(1);
  }
}
