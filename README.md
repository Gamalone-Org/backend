# GAMALONE Backend

API REST backend pour la marketplace GAMALONE - plateforme de vente d'œuvres d'art et d'artisanat.

## 🏗️ Architecture

Monolithic backend modulaire construit avec :

- **Runtime** : Node.js v25.2.1
- **Language** : TypeScript 5.7
- **Framework** : Express.js 5.2
- **Database** : PostgreSQL avec Prisma ORM 7.9
- **Validation** : Zod
- **Logging** : Pino
- **Security** : Helmet + CORS + Rate Limiting
- **Testing** : Vitest + Supertest
- **Linting** : ESLint
- **Formatting** : Prettier

## 📋 Prérequis

- Node.js >= 25.2.1 (voir `.nvmrc`)
- npm >= 11.6.2
- PostgreSQL (base de données)
- Variables d'environnement configurées (`.env`)

## 🚀 Démarrage rapide

### Installation

```bash
npm install
```

### Variables d'environnement

Copier `.env.example` en `.env` et remplir les valeurs :

```bash
cp .env.example .env
```

### Développement

```bash
npm run dev
```

Le serveur démarre sur `http://localhost:5000`

### Build

```bash
npm run build
```

### Production

```bash
npm run start
```

## 📚 Scripts npm

| Script                    | Description                                    |
| ------------------------- | ---------------------------------------------- |
| `npm run dev`             | Démarrer en mode développement avec hot-reload |
| `npm run build`           | Compiler TypeScript en JavaScript              |
| `npm run start`           | Démarrer le serveur de production              |
| `npm run typecheck`       | Vérifier les types TypeScript                  |
| `npm run lint`            | Lancer ESLint                                  |
| `npm run lint:fix`        | Corriger les erreurs ESLint                    |
| `npm run format`          | Formater le code avec Prettier                 |
| `npm run format:check`    | Vérifier le formatage                          |
| `npm test`                | Exécuter les tests                             |
| `npm run test:watch`      | Exécuter les tests en mode watch               |
| `npm run test:coverage`   | Générer un rapport de couverture               |
| `npm run prisma:generate` | Générer le client Prisma                       |
| `npm run prisma:validate` | Valider le schéma Prisma                       |
| `npm run prisma:format`   | Formater le schéma Prisma                      |

## 🗂️ Structure du projet

```
src/
├── config/              # Configuration centralisée
│   ├── env.ts          # Validation variables d'environnement
│   ├── database.ts     # Configuration Prisma
│   ├── redis.ts        # Configuration Redis
│   ├── cloudinary.ts   # Configuration Cloudinary
│   └── index.ts        # Export configuration
│
├── common/              # Code partagé
│   ├── errors/         # Gestion centralisée des erreurs
│   ├── middleware/     # Middlewares Express
│   ├── utils/          # Utilitaires
│   ├── constants/      # Constantes
│   └── types/          # Types TypeScript
│
├── modules/            # Modules métier
│   ├── auth/           # Authentification
│   ├── users/          # Gestion des utilisateurs
│   ├── artisans/       # Gestion des artisans
│   └── ...             # Autres modules
│
├── routes/             # Routage Express
│   └── index.ts        # Routes API
│
├── app.ts              # Configuration Express
└── server.ts           # Démarrage du serveur

prisma/
├── schema.prisma       # Schéma de base de données
└── seed.ts            # Données de démarrage

tests/
├── unit/              # Tests unitaires
└── integration/       # Tests d'intégration

docs/                  # Documentation
```

## 🔌 Endpoints API

### Health Check

```http
GET /api/v1/health
```

Response:

```json
{
  "success": true,
  "message": "GAMALONE API is running"
}
```

Tous les autres endpoints utilisent le préfixe `/api/v1`.

## 🧪 Tests

### Exécuter tous les tests

```bash
npm test
```

### Mode watch

```bash
npm run test:watch
```

### Couverture

```bash
npm run test:coverage
```

Les tests sont situés dans `tests/` et utilisent Vitest + Supertest.

## 📝 Gestion des erreurs

Les erreurs sont centralisées via la classe `AppError`. Toutes les réponses d'erreur suivent le format :

```json
{
  "success": false,
  "message": "Message d'erreur",
  "code": "ERROR_CODE"
}
```

## 🔐 Sécurité

- **Helmet** : Configuration des headers de sécurité HTTP
- **CORS** : Contrôle des origines autorisées
- **Rate Limiting** : Limitation du nombre de requêtes (100 req/15min)
- **JWT** : Authentification (à implémenter)
- **Validation** : Zod pour valider toutes les entrées

Les variables sensibles (secrets, tokens) ne doivent JAMAIS être commitées dans Git.

## 🗄️ Base de données

### Configuration

Le backend utilise Prisma ORM avec PostgreSQL. La configuration se fait via `.env` :

```
DATABASE_URL=postgresql://user:password@localhost:5432/gamalone
```

### Migrations

```bash
# Créer une migration après changement du schéma
npx prisma migrate dev --name nom_migration

# Appliquer les migrations en production
npx prisma migrate deploy
```

### Seed (données initiales)

```bash
npx prisma db seed
```

## 🐳 Docker

### Build

```bash
docker build -t gamalone-backend .
```

### Run

```bash
docker run -p 5000:5000 --env-file .env gamalone-backend
```

### Docker Compose

```bash
docker-compose up
```

## CI/CD

Le projet utilise GitHub Actions pour l'intégration continue. Le workflow `.github/workflows/ci.yml` exécute :

- Linting (ESLint)
- Type checking (TypeScript)
- Build
- Tests

## 📦 Dépendances principales

### Runtime

- `express` - Framework web
- `@prisma/client` - ORM
- `zod` - Validation
- `helmet` - Sécurité HTTP
- `cors` - Cross-Origin Resource Sharing
- `express-rate-limit` - Rate limiting
- `pino` - Logging
- `pino-http` - HTTP logging

### Development

- `typescript` - Language
- `@typescript-eslint/*` - Linting TypeScript
- `vitest` - Testing framework
- `supertest` - HTTP testing
- `prettier` - Code formatting

## 🚧 Roadmap

### Phase 1 : Infrastructure ✅

- [x] Setup TypeScript
- [x] Configuration Express
- [x] Gestion centralisée des erreurs
- [x] Logging avec Pino
- [x] Sécurité (Helmet, CORS, Rate Limiting)
- [x] Tests setup
- [x] ESLint & Prettier
- [x] Docker & CI/CD

### Phase 2 : Modules métier

À venir :

1. Authentication & JWT
2. Users Management
3. Artisans Management
4. KYC Process
5. Categories
6. Artworks
7. Media & Images
8. Shopping Cart
9. Orders
10. Payments
11. Deliveries
12. Reviews
13. Certificates
14. Notifications
15. Support
16. Admin

## 📖 Documentation supplémentaire

- [Architecture détaillée](docs/architecture.md)
- [Guide d'authentification](docs/auth.md) (à venir)
- [Guide des modules](docs/modules.md) (à venir)

## 🤝 Contribution

Ce projet est en développement actif. Les contributions sont bienvenues.

## 📄 License

ISC
