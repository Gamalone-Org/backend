declare module 'cors' {
  import type { RequestHandler } from 'express';

  interface CorsOptions {
    origin?:
      | string
      | string[]
      | boolean
      | ((
          origin: string | undefined,
          callback: (err: Error | null, allow?: boolean) => void
        ) => void);
    credentials?: boolean;
    methods?: string | string[];
    allowedHeaders?: string | string[];
    exposedHeaders?: string | string[];
    maxAge?: number;
  }

  function cors(options?: CorsOptions): RequestHandler;

  export = cors;
}
