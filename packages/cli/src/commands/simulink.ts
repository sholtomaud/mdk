import * as fs from 'fs';
import * as path from 'path';
import type { BgStateSpace } from '@mdk/core';

/* Simulink export — generates a MATLAB script that builds the model
 * programmatically using the Simulink API (ss2sim).
 * Full .slx binary generation requires MATLAB/Simulink on the host;
 * the generated .m script is the portable representation. */

function matML(name: string, data: number[][]): string {
  const rows = data.map(r => r.map(v => v.toFixed(10)).join(', ')).join(';\n  ');
  return `${name} = [${rows}];`;
}

function generateMScript(ss: BgStateSpace, dt: number): string {
  return `%% MDK generated Simulink model script — do not edit.
%% Run inside MATLAB to create the state-space Simulink block.
clear; clc;

${matML('A', ss.A)}
${matML('B', ss.B)}
${matML('C_mat', ss.C)}
${matML('D', ss.D)}

Ts = ${dt};  % sample time

sys_c = ss(A, B, C_mat, D);          % continuous-time state-space
sys_d = c2d(sys_c, Ts, 'zoh');       % discretise (zero-order hold)

%% Create Simulink model
mdl = 'mdk_model';
new_system(mdl);
open_system(mdl);

add_block('simulink/Continuous/State-Space', [mdl '/SS_Plant'], ...
    'A', mat2str(A), ...
    'B', mat2str(B), ...
    'C', mat2str(C_mat), ...
    'D', mat2str(D), ...
    'X0', mat2str(zeros(${ss.state_count}, 1)), ...
    'Position', [150 100 300 200]);

add_block('simulink/Sinks/Scope', [mdl '/Scope'], ...
    'Position', [400 130 450 170]);
add_line(mdl, 'SS_Plant/1', 'Scope/1');

save_system(mdl, 'mdk_model.slx');
disp('Saved → mdk_model.slx');
disp('State names: ${ss.state_names.join(', ')}');
disp('Input names: ${ss.input_names.join(', ')}');
`;
}

export function cmdSimulink(opts: { output?: string }): void {
  const synthFile = path.resolve(process.cwd(), 'model.mdk.json');
  if (!fs.existsSync(synthFile)) {
    console.error('model.mdk.json not found. Run mdk synth first.');
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(synthFile, 'utf8')) as {
    result?: { state_space?: BgStateSpace };
    model?: { config?: { dt?: number } };
  };

  const ss = payload.result?.state_space;
  if (!ss) {
    console.error('No state_space in model.mdk.json. Re-run mdk synth with a config block.');
    process.exit(1);
  }

  const dt = payload.model?.config?.dt ?? 0.001;
  const outFile = opts.output ?? 'mdk_model.m';
  fs.writeFileSync(path.resolve(process.cwd(), outFile), generateMScript(ss, dt));

  console.log(`✓ Simulink script generated → ${outFile}`);
  console.log('  Open MATLAB and run the script to create mdk_model.slx');
}
