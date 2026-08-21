import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { getCorsAllowlist, isAllowedOrigin } from './config/cors.js';
import { swaggerDocument, swaggerOptions } from './config/swagger.js';
import { errorHandler } from './common/errors/index.js';
import { notFoundMiddleware } from './common/middleware/index.js';
import routes from './routes/index.js';

const app = express();

// Trust proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = new Set(
  getCorsAllowlist({
    NODE_ENV: env.NODE_ENV,
    API_PUBLIC_URL: env.API_PUBLIC_URL,
    CORS_ORIGINS: env.CORS_ORIGINS,
  })
);
const corsOptions = {
  origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    const normalizedOrigin = origin && origin !== 'null' ? origin.replace(/\/+$/, '') : '';

    if (!origin || origin === 'null' || allowedOrigins.has(normalizedOrigin) || isAllowedOrigin(origin, {
      NODE_ENV: env.NODE_ENV,
      API_PUBLIC_URL: env.API_PUBLIC_URL,
      CORS_ORIGINS: env.CORS_ORIGINS,
    })) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Authorization'],
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Request logging
app.use(
  pinoHttp({
    autoLogging: env.NODE_ENV !== 'test',
    level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.get('/', (_req, res) => {
  res.redirect('/docs/');
});

app.get('/openapi.json', (_req, res) => {
  res.status(200).json(swaggerDocument);
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerOptions));

// Routes
app.use('/api', routes);

// 404 Not Found
app.use(notFoundMiddleware);

// Global error handler (must be last)
app.use(errorHandler);

export default app;
