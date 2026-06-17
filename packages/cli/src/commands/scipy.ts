import * as fs from 'fs';
import * as path from 'path';
import type { BgStateSpace } from '@mdk/core';

function matLiteral(m: number[][]): string {
  return '[' + m.map(r => '[' + r.map(v => v.toFixed(10)).join(', ') + ']').join(',\n        ') + ']';
}

function generateScript(
  ss: BgStateSpace,
  dt: number,
  tEnd: number,
  stateNames: string[],
  inputNames: string[],
): string {
  return `#!/usr/bin/env python3
"""
MDK generated SciPy simulation — do not edit.
State-space model: ẋ = Ax + Bu,  y = Cx + Du
"""
import numpy as np
from scipy.integrate import solve_ivp
import matplotlib.pyplot as plt

# ── State-space matrices ──────────────────────────────────────────
A = np.array(${matLiteral(ss.A)})
B = np.array(${matLiteral(ss.B)})
C = np.array(${matLiteral(ss.C)})
D = np.array(${matLiteral(ss.D)})

state_names = ${JSON.stringify(stateNames)}
input_names = ${JSON.stringify(inputNames)}

dt     = ${dt}
t_end  = ${tEnd}

# ── Constant input — edit as needed ──────────────────────────────
u = np.ones(${ss.input_count})

# ── ODE RHS ──────────────────────────────────────────────────────
def rhs(t, x):
    return A @ x + B @ u

# ── Solve ─────────────────────────────────────────────────────────
t_span = (0.0, t_end)
t_eval = np.arange(0.0, t_end, dt)
x0     = np.zeros(${ss.state_count})

sol = solve_ivp(rhs, t_span, x0, t_eval=t_eval, method='RK45', dense_output=False)

# ── Outputs y = C·x ──────────────────────────────────────────────
y = (C @ sol.y).T   # shape: (steps, n_outputs)

# ── Plot ──────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(9, 4))
for i, name in enumerate(state_names):
    # physical value (y_i = x_i / param_i already encoded in C matrix)
    ax.plot(sol.t, y[:, i], label=name)
ax.set_xlabel('Time (s)')
ax.set_ylabel('State (physical units)')
ax.set_title('MDK Bond Graph Simulation')
ax.legend()
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('mdk_simulation.png', dpi=150)
plt.show()
print('Saved → mdk_simulation.png')
`;
}

export function cmdScipy(opts: { output?: string }): void {
  const synthFile = path.resolve(process.cwd(), 'model.mdk.json');
  if (!fs.existsSync(synthFile)) {
    console.error('model.mdk.json not found. Run mdk synth first.');
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(synthFile, 'utf8')) as {
    result?: { state_space?: BgStateSpace };
    model?: { config?: { dt?: number; t_end?: number } };
  };

  const ss = payload.result?.state_space;
  if (!ss) {
    console.error('No state_space in model.mdk.json. Re-run mdk synth with a config block.');
    process.exit(1);
  }

  const dt   = payload.model?.config?.dt   ?? 0.001;
  const tEnd = payload.model?.config?.t_end ?? 1.0;

  const outFile = opts.output ?? 'mdk_simulation.py';
  const script = generateScript(ss, dt, tEnd, ss.state_names, ss.input_names);
  fs.writeFileSync(path.resolve(process.cwd(), outFile), script);

  console.log(`✓ SciPy script generated → ${outFile}`);
  console.log(`  Run with: python3 ${outFile}`);
}
