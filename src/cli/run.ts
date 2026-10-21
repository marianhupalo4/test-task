import { spawn } from 'node:child_process';

export function runWithEnv(command: string[], secrets: Record<string, string>): Promise<number> {
  const [bin, ...args] = command;
  if (!bin) {
    return Promise.reject(new Error('No command provided'));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: 'inherit',
      env: { ...process.env, ...secrets },
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}
