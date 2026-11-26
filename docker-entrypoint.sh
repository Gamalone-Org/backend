
#!/bin/sh

set -e

echo "Waiting for database migrations..."

# Apply Prisma migrations
./node_modules/.bin/prisma migrate deploy

echo "Database migrations completed."

# Run seed
npm run db:seed

echo "Database seeding completed."

# Start application
echo "Starting Gamalone API..."

exec node dist/server.js
