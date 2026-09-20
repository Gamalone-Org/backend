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
    ...publicSelect.artisan,
    select: {
      ...publicSelect.artisan.select,
      user: {
        select: { id: true, nom: true, telephone: true },
      },
    },
  },
};

async function main() {
  console.log('oeuvres=', await prisma.oeuvre.count());
  console.log('artisanProfiles=', await prisma.artisanProfile.count());
  const page = 1;
  const limit = 20;
  const filters = {};
  const where = { ...filters };
  try {
    const [oeuvres, total] = await Promise.all([
      prisma.oeuvre.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: adminSelect as never,
      }),
      prisma.oeuvre.count({ where }),
    ]);
    console.log('OK');
    console.log('total=', total);
    console.log('oeuvres.length=', oeuvres.length);
    console.log('first=', JSON.stringify(oeuvres[0], null, 2));
  } catch (error) {
    console.error('FAILED');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();