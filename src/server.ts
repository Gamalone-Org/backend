// Load environment variables before everything else
import 'dotenv/config';

import { env } from './config/env.js';
import app from './app.js';

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  console.log(`🚀 GAMALONE API server is running on port ${PORT}`);
  console.log(`📝 Environment: ${env.NODE_ENV}`);
});

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('📦 Shutting down gracefully...');
  server.close(() => {
    console.log('✓ Server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('✗ Forced shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
