import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtisanProfileRepository } from '../../src/modules/artisan-profile/artisan-profile.repository.js';

const ARTISAN_ID = '123e4567-e89b-12d3-a456-426614174111';

function buildRepository(overrides = {}) {
  const prisma = {
    artisanProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    artisanAtelierPhoto: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    creationProcessus: {
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    exposition: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    artisanPaymentPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prisma)),
    ...overrides.prisma,
  } as any;

  const cloudinary = {
    uploadImage: vi.fn(),
    deleteAsset: vi.fn(),
    ...overrides.cloudinary,
  } as any;

  const repository = new ArtisanProfileRepository(
    prisma as any,
    () => cloudinary as any
  ) as any;

  return { repository, prisma, cloudinary };
}

const IMAGE_OPTIONS = { domain: 'artworks' as const, mimeType: 'image/jpeg', bytes: 1024 };

describe('ArtisanProfileRepository — photos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads a photo de profil and replaces the previous one', async () => {
    const { repository, prisma, cloudinary } = buildRepository();
    prisma.artisanProfile.findUnique.mockResolvedValue({
      photoProfilPublicId: 'ancien-public-id',
    });
    cloudinary.deleteAsset.mockResolvedValue(undefined);
    cloudinary.uploadImage.mockResolvedValue({
      secureUrl: 'https://cloudinary.com/nouveau.jpg',
      publicId: 'nouveau-public-id',
    });
    prisma.artisanProfile.update.mockResolvedValue({
      photoProfilUrl: 'https://cloudinary.com/nouveau.jpg',
    });

    const result = await repository.uploadPhotoProfil(
      ARTISAN_ID,
      Buffer.from('x'),
      IMAGE_OPTIONS
    );

    expect(cloudinary.deleteAsset).toHaveBeenCalledWith('ancien-public-id', 'image');
    expect(cloudinary.uploadImage).toHaveBeenCalledWith(Buffer.from('x'), IMAGE_OPTIONS);
    expect(prisma.artisanProfile.update).toHaveBeenCalledWith({
      where: { id: ARTISAN_ID },
      data: {
        photoProfilUrl: 'https://cloudinary.com/nouveau.jpg',
        photoProfilPublicId: 'nouveau-public-id',
        photoProfilMimeType: 'image/jpeg',
        photoProfilSize: 1024,
      },
    });
    expect(result.photoProfilUrl).toBe('https://cloudinary.com/nouveau.jpg');
  });

  it('deletePhotoProfil clears the Cloudinary asset and DB fields', async () => {
    const { repository, prisma, cloudinary } = buildRepository();
    prisma.artisanProfile.findUnique.mockResolvedValue({ photoProfilPublicId: 'pub-id' });
    cloudinary.deleteAsset.mockResolvedValue(undefined);
    prisma.artisanProfile.update.mockResolvedValue({ id: ARTISAN_ID });

    await repository.deletePhotoProfil(ARTISAN_ID);

    expect(cloudinary.deleteAsset).toHaveBeenCalledWith('pub-id', 'image');
    expect(prisma.artisanProfile.update).toHaveBeenCalledWith({
      where: { id: ARTISAN_ID },
      data: {
        photoProfilUrl: null,
        photoProfilPublicId: null,
        photoProfilMimeType: null,
        photoProfilSize: null,
      },
    });
  });

  it('uploads a bannière and replaces the previous one', async () => {
    const { repository, prisma, cloudinary } = buildRepository();
    prisma.artisanProfile.findUnique.mockResolvedValue({ photoBannierePublicId: 'ancien' });
    cloudinary.deleteAsset.mockResolvedValue(undefined);
    cloudinary.uploadImage.mockResolvedValue({
      secureUrl: 'https://cloudinary.com/banner.jpg',
      publicId: 'nouveau-banner',
    });
    prisma.artisanProfile.update.mockResolvedValue({ photoBanniereUrl: 'https://cloudinary.com/banner.jpg' });

    const result = await repository.uploadBanniere(ARTISAN_ID, Buffer.from('x'), IMAGE_OPTIONS);

    expect(cloudinary.deleteAsset).toHaveBeenCalledWith('ancien', 'image');
    expect(result.photoBanniereUrl).toBe('https://cloudinary.com/banner.jpg');
  });

  it('uploads an atelier photo with the next ordre', async () => {
    const { repository, prisma, cloudinary } = buildRepository();
    prisma.artisanAtelierPhoto.findFirst.mockResolvedValue({ ordre: 1 });
    cloudinary.uploadImage.mockResolvedValue({
      secureUrl: 'https://cloudinary.com/atelier.jpg',
      publicId: 'atelier-1',
    });
    prisma.artisanAtelierPhoto.create.mockImplementation(({ data }: any) => data);

    const result = await repository.uploadAtelierPhoto(ARTISAN_ID, Buffer.from('x'), IMAGE_OPTIONS);

    expect(prisma.artisanAtelierPhoto.create).toHaveBeenCalledWith({
      data: {
        artisanId: ARTISAN_ID,
        url: 'https://cloudinary.com/atelier.jpg',
        publicId: 'atelier-1',
        mimeType: 'image/jpeg',
        size: 1024,
        ordre: 2,
      },
    });
    expect(result.ordre).toBe(2);
  });

  it('deletes an atelier photo from Cloudinary and DB', async () => {
    const { repository, prisma, cloudinary } = buildRepository();
    prisma.artisanAtelierPhoto.findUnique.mockResolvedValue({
      id: 'photo-1',
      publicId: 'atelier-pub',
    });
    cloudinary.deleteAsset.mockResolvedValue(undefined);
    prisma.artisanAtelierPhoto.delete.mockResolvedValue({ id: 'photo-1' });

    const result = await repository.deleteAtelierPhoto('photo-1');

    expect(cloudinary.deleteAsset).toHaveBeenCalledWith('atelier-pub', 'image');
    expect(prisma.artisanAtelierPhoto.delete).toHaveBeenCalledWith({ where: { id: 'photo-1' } });
    expect(result.id).toBe('photo-1');
  });

  it('returns null when deleting a non-existent photo', async () => {
    const { repository, prisma } = buildRepository();
    prisma.artisanAtelierPhoto.findUnique.mockResolvedValue(null);

    const result = await repository.deleteAtelierPhoto('photo-inconnue');

    expect(result).toBeNull();
  });

  it('reorders photos in a transaction with scoped artisanId', async () => {
    const { repository, prisma } = buildRepository();
    prisma.$transaction.mockImplementation(async (fn: any) => {
      prisma.artisanAtelierPhoto.update = vi.fn(async ({ where }: any) => ({ where }));
      return fn(prisma);
    });

    await repository.reorderAtelierPhotos(ARTISAN_ID, ['p3', 'p1', 'p2']);

    expect(prisma.artisanAtelierPhoto.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'p3', artisanId: ARTISAN_ID },
      data: { ordre: 0 },
    });
    expect(prisma.artisanAtelierPhoto.update).toHaveBeenNthCalledWith(3, {
      where: { id: 'p2', artisanId: ARTISAN_ID },
      data: { ordre: 2 },
    });
  });
});

describe('ArtisanProfileRepository — processus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes a processus étape and its Cloudinary photo', async () => {
    const { repository, prisma, cloudinary } = buildRepository();
    prisma.creationProcessus.findUnique.mockResolvedValue({
      id: 'etape-1',
      photoPublicId: 'proc-photo',
    });
    cloudinary.deleteAsset.mockResolvedValue(undefined);
    prisma.creationProcessus.delete.mockResolvedValue({ id: 'etape-1' });

    const result = await repository.deleteProcessusEtape('etape-1');

    expect(cloudinary.deleteAsset).toHaveBeenCalledWith('proc-photo', 'image');
    expect(result.id).toBe('etape-1');
  });

  it('cleans a previous photo when uploading a new one', async () => {
    const { repository, prisma, cloudinary } = buildRepository();
    prisma.creationProcessus.findUnique.mockResolvedValue({ photoPublicId: 'ancienne-photo' });
    cloudinary.deleteAsset.mockResolvedValue(undefined);
    cloudinary.uploadImage.mockResolvedValue({
      secureUrl: 'https://cloudinary.com/nouvelle.jpg',
      publicId: 'nouvelle-photo',
    });
    prisma.creationProcessus.update.mockResolvedValue({ id: 'etape-1', photoUrl: 'https://cloudinary.com/nouvelle.jpg' });

    const result = await repository.uploadProcessusPhoto('etape-1', Buffer.from('x'), IMAGE_OPTIONS);

    expect(cloudinary.deleteAsset).toHaveBeenCalledWith('ancienne-photo', 'image');
    expect(result.photoUrl).toBe('https://cloudinary.com/nouvelle.jpg');
  });

  it('reorders processus steps starting at ordre 1', async () => {
    const { repository, prisma } = buildRepository();
    prisma.$transaction.mockImplementation(async (fn: any) => {
      prisma.creationProcessus.update = vi.fn(async ({ where }: any) => ({ where }));
      return fn(prisma);
    });

    await repository.reorderProcessus(ARTISAN_ID, ['e1', 'e2', 'e3']);

    expect(prisma.creationProcessus.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'e1', artisanId: ARTISAN_ID },
      data: { ordre: 1 },
    });
    expect(prisma.creationProcessus.update).toHaveBeenNthCalledWith(3, {
      where: { id: 'e3', artisanId: ARTISAN_ID },
      data: { ordre: 3 },
    });
  });
});

describe('ArtisanProfileRepository — expositions, paiement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists expositions ordered by année DESC puis createdAt DESC', async () => {
    const { repository, prisma } = buildRepository();
    prisma.exposition.findMany.mockResolvedValue([{ id: 'exp-1' }]);

    await repository.getExpositions(ARTISAN_ID);

    expect(prisma.exposition.findMany).toHaveBeenCalledWith({
      where: { artisanId: ARTISAN_ID },
      orderBy: [{ annee: 'desc' }, { createdAt: 'desc' }],
    });
  });

  it('upserts a payment preference', async () => {
    const { repository, prisma } = buildRepository();
    prisma.artisanPaymentPreference.upsert.mockResolvedValue({ id: 'pref-1' });

    const result = await repository.upsertPaymentPreference(ARTISAN_ID, {
      methode: 'MOBILE_MONEY',
      mobileMoneyOperateur: 'Moov',
      mobileMoneyNumero: '+22890123456',
    });

    expect(prisma.artisanPaymentPreference.upsert).toHaveBeenCalledWith({
      where: { artisanId: ARTISAN_ID },
      create: {
        artisanId: ARTISAN_ID,
        methode: 'MOBILE_MONEY',
        mobileMoneyOperateur: 'Moov',
        mobileMoneyNumero: '+22890123456',
      },
      update: {
        methode: 'MOBILE_MONEY',
        mobileMoneyOperateur: 'Moov',
        mobileMoneyNumero: '+22890123456',
      },
    });
    expect(result.id).toBe('pref-1');
  });

  it('loads the full profile with all collections', async () => {
    const { repository, prisma } = buildRepository();
    prisma.artisanProfile.findUnique.mockResolvedValue({ id: ARTISAN_ID });

    const result = await repository.findFullProfile(ARTISAN_ID);

    expect(prisma.artisanProfile.findUnique).toHaveBeenCalledWith({
      where: { id: ARTISAN_ID },
      include: {
        user: { select: { id: true, email: true, nom: true, telephone: true } },
        atelierPhotos: { orderBy: { ordre: 'asc' } },
        processusEtapes: { orderBy: { ordre: 'asc' } },
        expositions: { orderBy: [{ annee: 'desc' }, { createdAt: 'desc' }] },
        paiementPreference: true,
      },
    });
    expect(result.id).toBe(ARTISAN_ID);
  });

  it('updates the profile with devise/langue enums', async () => {
    const { repository, prisma } = buildRepository();
    prisma.artisanProfile.update.mockResolvedValue({ id: ARTISAN_ID });

    await repository.updateProfil(ARTISAN_ID, {
      devise: 'XOF',
      langue: 'fr',
      preparationMinDays: 3,
      preparationMaxDays: 5,
      liensReseauxSociaux: { instagram: 'https://instagram.com/x' },
    });

    expect(prisma.artisanProfile.update).toHaveBeenCalledWith({
      where: { id: ARTISAN_ID },
      data: {
        devise: 'XOF',
        langue: 'fr',
        preparationMinDays: 3,
        preparationMaxDays: 5,
        liensReseauxSociaux: { instagram: 'https://instagram.com/x' },
      },
    });
  });
});