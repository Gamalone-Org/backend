declare module 'swagger-ui-dist' {
  export function getAbsoluteFSPath(): string;
  export function absolutePath(): string;
  export const SwaggerUIBundle: unknown;
  export const SwaggerUIStandalonePreset: unknown;
  const swaggerUiDist: {
    getAbsoluteFSPath: () => string;
    absolutePath: () => string;
    SwaggerUIBundle: unknown;
    SwaggerUIStandalonePreset: unknown;
  };
  export default swaggerUiDist;
}
