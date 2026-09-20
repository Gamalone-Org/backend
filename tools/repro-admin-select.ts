import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const publicSelect = {
  id: true,
  titre: true,
  description: true,
  technique: true,
  materiaux: true,
  dimensions: true,
  poids: true,
  anneeCreation: true,
  prixXOF: true,
  statut: true,
  disponibilite: true,
  estMiseEnAvant: true,
  createdAt: true,
  updatedAt: true,
  artisan: {
    select: {
      id: true,
      type: true,
      nomAtelier: true,
      specialite: true,
      localisation: true,
      estCertifie: true,
      photoAtelierUrl: true,
      user: {
        select: { id: true, nom: true },
      },
    },
  },
  categorie: {
    select: { id: true, nom: true, description: true },
  },
  medias: {
    orderBy: { ordre: 'asc' as const },
    select: { id: true, url: true, mimeType: true, type: true, width: true, height: true, ordre: true },
  },
  certificat: {
    select: { id: true, codeQR: true, dateEmission: true, estValide: true },
  },
};

const adminSelect = {
  ...publicSelect,
  rejectionReason: true,
  publishedByAdminId: true,
  artisan: {
    select: {
      ...publicSelect.artisan.select,
      user: {
        select: { id: true, nom: true, telephone: true },
      },
    },
  },
};

async function main() {
  try {
    const [oeuvres, total] = await Promise.all([
      prisma.oeuvre.findMany({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
        select: adminSelect as never,
      }),
      prisma.oeuvre.count({ where: {} }),
    ]);
    console.log('OK — no validation error');
    console.log('total=', total, 'length=', oeuvres.length);
  } catch (error) {
    console.error('FAILED');
    console.error('name=', (error as Error).name);
    console.error('message=', (error as Error).message);
    console.error('stack=', (error as Error).stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();