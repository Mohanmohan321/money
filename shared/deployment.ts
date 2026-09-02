type DeploymentEnvironment = Readonly<{ VERCEL?: string; RENDER?: string }>;

export function getClientBuildDirectory(_environment: DeploymentEnvironment) {
  return 'dist/client';
}

export function shouldStartHttpServer(_environment: DeploymentEnvironment) {
  return !_environment.VERCEL;
}
