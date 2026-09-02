type DeploymentEnvironment = Readonly<{ VERCEL?: string }>;

export function getClientBuildDirectory(_environment: DeploymentEnvironment) {
  return _environment.VERCEL ? 'public' : 'dist/client';
}

export function shouldStartHttpServer(_environment: DeploymentEnvironment) {
  return !_environment.VERCEL;
}
