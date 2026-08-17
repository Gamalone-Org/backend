# Architecture - GAMALONE Backend

## 📐 Vue d'ensemble

Le backend GAMALONE est un **modular monolith** : une application monolithique unique mais organisée de manière modulaire. Cette approche offre les avantages de la simplicité de déploiement tout en gardant le code bien organisé et scalable.

```
┌─────────────────────────────────────────────┐
│         HTTP Requests (Client)              │
└─────────────────┬───────────────────────────┘
                  │
        ┌─────────▼─────────┐
        │   Express App     │
        └─────────┬─────────┘
                  │
    ┌─────────────┼─────────────┐
    │ Middlewares │             │
    │ - Helmet    │        Routes
    │ - CORS      │        /api/v1
    │ - Logging   │
    └─────────────┼─────────────┘
                  │
    ┌─────────────▼─────────────┐
    │   Module System            │
    │  (Auth, Users, Orders...)  │
    └─────────────┬─────────────┘
                  │
    ┌─────────────▼─────────────┐
    │   Service Layer           │
    │   (Business Logic)        │
    └─────────────┬─────────────┘
                  │
    ┌─────────────▼─────────────┐
    │   Repository Layer        │
    │   (Data Access)           │
    └─────────────┬─────────────┘
                  │
    ┌─────────────▼─────────────┐
    │   Prisma ORM              │
    └─────────────┬─────────────┘
                  │
        ┌─────────▼─────────┐
        │   PostgreSQL DB   │
        └───────────────────┘
```

## 🏛️ Structure des dossiers

### `/src/config`

Centralise toute la configuration de l'application.

```
config/
├── env.ts           # Validation des variables d'environnement avec Zod
├── database.ts      # Configuration Prisma
├── redis.ts         # Configuration Redis (optionnel)
├── cloudinary.ts    # Configuration Cloudinary (optionnel)
└── index.ts         # Export centralisé
```

**Principes** :

- Une seule source de vérité pour la configuration
- Validation stricte à la startup
- Pas de `process.env` dispersé dans le code
- Les services optionnels (Redis, Cloudinary) ne crash pas si mal configurés

### `/src/common`

Code partagé entre tous les modules.

```
common/
├── errors/
│   ├── AppError.ts       # Classe d'erreur centralisée
│   ├── errorHandler.ts   # Middleware d'erreur
│   └── index.ts          # Export
├── middleware/
│   ├── notFound.middleware.ts
│   └── index.ts
├── utils/               # Fonctions utilitaires
├── constants/           # Constantes de l'app
└── types/               # Types TypeScript partagés
```

### `/src/modules`

Chaque module métier est isolé et suit une architecture couche par couche.

```
modules/
└── nomModule/
    ├── controller.ts    # Gestion des requêtes HTTP
    ├── service.ts       # Logique métier
    ├── repository.ts    # Accès aux données
    ├── routes.ts        # Routage du module
    ├── schema.ts        # Validation Zod des inputs
    ├── types.ts         # Types du module
    └── index.ts         # Export du module
```

**Exemple** : `/src/modules/users/`

```
users/
├── user.controller.ts    # HTTP request/response
├── user.service.ts       # Business logic
├── user.repository.ts    # Database queries
├── user.routes.ts        # GET /users, POST /users, etc.
├── user.schema.ts        # CreateUserSchema, UpdateUserSchema
├── user.types.ts         # UserType, CreateUserInput, etc.
└── index.ts             # Export public
```

### `/src/routes`

Point central de toutes les routes API.

```
routes/
└── index.ts         # Agrège toutes les routes des modules
```

### `/src/app.ts` et `/src/server.ts`

Séparation claire entre la configuration de l'app et son démarrage.

- **app.ts** : Crée l'instance Express, configure les middlewares, les routes, les handlers d'erreur
- **server.ts** : Démarre le serveur, charge les env vars, gère l'arrêt gracieux

## 🔄 Flux d'une requête

```
1. HTTP Request
   ↓
2. Express Middlewares (Helmet, CORS, Logging, Rate Limiting)
   ↓
3. Route matching → Controller du module
   ↓
4. Controller valide l'input avec Zod
   ↓
5. Controller appelle le Service
   ↓
6. Service contient la logique métier
   ↓
7. Service appelle le Repository au besoin
   ↓
8. Repository exécute les queries Prisma
   ↓
9. Réponse remonte : Repository → Service → Controller
   ↓
10. Controller formate et envoie la réponse JSON
    ↓
11. Error Handler capte les erreurs à tout niveau
    ↓
12. HTTP Response
```

## 📊 Couches et responsabilités

### 1. Controller

**Responsabilités** :

- Parser les paramètres de la requête
- Valider les inputs avec Zod
- Appeler le Service
- Formater la réponse
- Gérer les status HTTP

**Ne doit PAS** :

- Contenir de logique métier
- Accéder directement à la base de données
- Connaître les détails d'implémentation du Service

**Exemple** :

```typescript
export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const input = CreateUserSchema.parse(req.body);
    const user = await userService.create(input);
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}
```

### 2. Service

**Responsabilités** :

- Logique métier
- Orchestration entre repositories
- Validation métier (au-delà de la validation input)
- Gestion des transactions si nécessaire

**Ne doit PAS** :

- Formater les réponses HTTP
- Accéder directement à Express (req, res)
- Contenir des queries Prisma brutes

**Exemple** :

```typescript
export async function createUser(input: CreateUserInput) {
  // Vérifier que l'email n'existe pas
  const existing = await userRepository.findByEmail(input.email);
  if (existing) throw new ConflictError('Email already registered');

  // Hasher le password
  const hashedPassword = await hashPassword(input.password);

  // Créer l'utilisateur
  const user = await userRepository.create({
    ...input,
    password: hashedPassword,
  });

  return user;
}
```

### 3. Repository

**Responsabilités** :

- Encapsuler toutes les queries Prisma
- Fournir une interface claire d'accès aux données
- Gérer les transformations de données si nécessaire

**Ne doit PAS** :

- Contenir de logique métier
- Avoir des dépendances sur les autres couches

**Exemple** :

```typescript
export async function create(input: CreateUserInput) {
  return prisma.user.create({
    data: input,
    select: { id: true, email: true, name: true },
  });
}

export async function findByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
  });
}
```

## 🔒 Gestion des erreurs

Toutes les erreurs doivent étendre `AppError` ou un de ses sous-types :

```typescript
// Créer une erreur
throw new ValidationError('Email invalide');
throw new NotFoundError('Utilisateur non trouvé');
throw new UnauthorizedError('Authentification requise');

// Error Handler middleware capture tout
// et formate une réponse JSON cohérente
```

Format de réponse d'erreur :

```json
{
  "success": false,
  "message": "Message d'erreur",
  "code": "ERROR_CODE"
}
```

## 📝 Validation

Utiliser Zod pour valider tous les inputs :

```typescript
// schema.ts
export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

// controller.ts
const input = CreateUserSchema.parse(req.body); // Throws ZodError si invalide
```

## 🔑 Configuration centralisée

Ne JAMAIS faire :

```typescript
// ❌ MAUVAIS
const dbUrl = process.env.DATABASE_URL;
const port = process.env.PORT;
```

Faire plutôt :

```typescript
// ✅ BON
import { env } from '@/config/env';

const dbUrl = env.DATABASE_URL;
const port = env.PORT;
```

## 🗄️ Prisma

### Schéma

Le schéma Prisma est dans `prisma/schema.prisma`. Il définit le modèle de données.

### Client

Générer le client après tout changement du schéma :

```bash
npm run prisma:generate
```

### Migrations

```bash
# Créer une migration après changement du schéma
npx prisma migrate dev --name add_user_table

# En production
npx prisma migrate deploy
```

### Seed

Pour peupler la DB avec des données de démarrage :

```bash
npx prisma db seed
```

## 📊 Logging

Utiliser Pino pour tous les logs :

```typescript
import { logger } from 'pino'; // ou via middleware pino-http

logger.info('User created', { userId });
logger.warn('High latency detected');
logger.error('Database error', error);
```

**Ne JAMAIS logger** :

- Passwords
- Tokens JWT
- API Keys
- Données sensibles
- Secrets

## 🔐 Sécurité

- **Helmet** : Configure les headers de sécurité HTTP
- **CORS** : Contrôle des origines autorisées
- **Rate Limiting** : 100 requêtes par IP / 15 minutes
- **Validation** : Zod pour valider toutes les entrées
- **Authentication** : JWT (à implémenter)

## 🧪 Tests

### Structure

```
tests/
├── unit/
│   └── services/
│       └── user.service.test.ts
└── integration/
    ├── health.test.ts
    └── users/
        └── users.integration.test.ts
```

### Exemple

```typescript
describe('User Service', () => {
  it('should create a user with valid data', async () => {
    const user = await userService.create({
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    });

    expect(user.email).toBe('test@example.com');
    expect(user.id).toBeDefined();
  });

  it('should throw ConflictError if email already exists', async () => {
    await expect(
      userService.create({
        email: 'existing@example.com',
        password: 'password123',
        name: 'User',
      })
    ).rejects.toThrow(ConflictError);
  });
});
```

## 🚀 Performance

- **Lazy loading** : Ne charger que les colonnes nécessaires avec Prisma's `select`
- **Eager loading** : Éviter les N+1 queries en utilisant `include` stratégiquement
- **Caching** : Redis pour les données fréquemment accédées (optionnel)
- **Rate limiting** : Protéger contre les abus

## 📈 Scalabilité

Le modular monolith est scalable :

- Chaque module peut être testé indépendamment
- La couche Repository abstrait la base de données
- Pas de couplage fort entre modules
- Possibilité de migrer vers microservices plus tard si nécessaire

## 🔄 CI/CD

Le projet utilise GitHub Actions (.github/workflows/ci.yml) :

1. Checkout code
2. Setup Node.js
3. npm ci (clean install)
4. ESLint (lint)
5. TypeScript (typecheck)
6. Build
7. Tests (Vitest)

## 📋 Checklist pour un nouveau module

1. Créer le dossier `modules/nomModule/`
2. Créer `controller.ts`, `service.ts`, `repository.ts`, `routes.ts`, `schema.ts`, `types.ts`, `index.ts`
3. Implémenter la logique du module
4. Exporter le module depuis `index.ts`
5. Enregistrer les routes dans `/src/routes/index.ts`
6. Ajouter des tests dans `tests/integration/nomModule/`
7. Lancer ESLint et les tests
8. Faire un commit

## 🎯 Principes clés

1. **Single Responsibility** : Chaque couche a une seule responsabilité
2. **Dependency Injection** : Les dépendances sont passées, pas globales
3. **No Magic** : Le code doit être explicite et lisible
4. **DRY** : Don't Repeat Yourself - code partagé dans `common/`
5. **Fail Fast** : Valider et lever des erreurs au plus tôt
6. **Centralized** : Configuration, erreurs, logging centralisés
7. **Testable** : Architecture qui facilite les tests
8. **Modular** : Chaque module peut évoluer indépendamment
