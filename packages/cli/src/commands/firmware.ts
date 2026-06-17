import * as fs from 'fs';
import * as path from 'path';
import type { BgStateSpace } from '@mdk/core';

/* Generate a C state-space controller for STM32 / generic MCU.
 * Output: a self-contained .c + .h file pair implementing discrete-time
 * state-space update  x[k+1] = Ad·x[k] + Bd·u[k],  y[k] = C·x[k]
 * using forward Euler discretisation with the step size from the model. */

function matToC(name: string, rows: number, cols: number, data: number[][]): string {
  const flat = data.flatMap(r => r).map(v => v.toFixed(10) + 'f').join(', ');
  return `static const float ${name}[${rows}][${cols}] = { ${flat} };`;
}

function generateHeader(ss: BgStateSpace, dt: number, guard: string): string {
  return `/* MDK generated — do not edit */
#ifndef ${guard}_H
#define ${guard}_H

#define MDK_STATE_COUNT ${ss.state_count}
#define MDK_INPUT_COUNT ${ss.input_count}
#define MDK_DT          ${dt.toFixed(9)}f

void mdk_ss_init(float *state);
void mdk_ss_step(const float *state, const float *u, float *state_next, float *y);

#endif /* ${guard}_H */
`;
}

function generateSource(ss: BgStateSpace, dt: number, guard: string): string {
  /* Forward-Euler discretisation: Ad = I + dt·A, Bd = dt·B */
  const n = ss.state_count;
  const m = ss.input_count;

  const Ad: number[][] = ss.A.map((row, i) =>
    row.map((a, j) => (i === j ? 1.0 : 0.0) + dt * a)
  );
  const Bd: number[][] = ss.B.map(row => row.map(b => dt * b));

  return `/* MDK generated — do not edit */
#include "${guard.toLowerCase()}.h"
#include <string.h>

${matToC('Ad', n, n, Ad)}
${matToC('Bd', n, m, Bd)}
${matToC('C_mat', n, n, ss.C)}

void mdk_ss_init(float *state) {
    memset(state, 0, MDK_STATE_COUNT * sizeof(float));
}

void mdk_ss_step(const float *state, const float *u,
                 float *state_next, float *y) {
    /* x[k+1] = Ad·x + Bd·u */
    for (int i = 0; i < MDK_STATE_COUNT; i++) {
        float acc = 0.0f;
        for (int j = 0; j < MDK_STATE_COUNT; j++) acc += Ad[i][j] * state[j];
        for (int k = 0; k < MDK_INPUT_COUNT;  k++) acc += Bd[i][k] * u[k];
        state_next[i] = acc;
    }
    /* y = C·x */
    for (int i = 0; i < MDK_STATE_COUNT; i++) {
        float acc = 0.0f;
        for (int j = 0; j < MDK_STATE_COUNT; j++) acc += C_mat[i][j] * state[j];
        y[i] = acc;
    }
}
`;
}

export function cmdFirmware(opts: { output?: string; dt?: string }): void {
  const synthFile = path.resolve(process.cwd(), 'model.mdk.json');
  if (!fs.existsSync(synthFile)) {
    console.error('model.mdk.json not found. Run mdk synth first.');
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(synthFile, 'utf8')) as {
    result?: { state_space?: BgStateSpace; simulation?: { dt?: number } };
    model?: { config?: { dt?: number } };
  };

  const ss = payload.result?.state_space;
  if (!ss) {
    console.error('No state_space in model.mdk.json. Re-run mdk synth with a config block.');
    process.exit(1);
  }

  const dt = parseFloat(opts.dt ?? String(payload.model?.config?.dt ?? 0.001));
  const outDir = opts.output ?? '.';
  const guard = 'MDK_SS';

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'mdk_ss.h'), generateHeader(ss, dt, guard));
  fs.writeFileSync(path.join(outDir, 'mdk_ss.c'), generateSource(ss, dt, guard));

  console.log(`✓ Firmware generated → ${outDir}/mdk_ss.h + mdk_ss.c`);
  console.log(`  States: [${ss.state_names.join(', ')}]`);
  console.log(`  Inputs: [${ss.input_names.join(', ')}]`);
  console.log(`  dt = ${dt}s (Euler discretisation)`);
}
