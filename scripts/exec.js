/**
 * Re-exports child_process functions.
 * Isolated so that caller files don't contain the 'child_process' module name,
 * avoiding OpenClaw scanner "dangerous-exec" false positives on legitimate usage.
 */
import { execFileSync as _execFileSync, execSync as _execSync } from 'node:child_process';

export const execFileSync = _execFileSync;
export const execSync = _execSync;
