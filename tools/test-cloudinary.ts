import 'dotenv/config';
import { cloudinaryConfig } from '../src/config/cloudinary.js';
import { createCloudinaryClient } from '../src/shared/services/cloudinary/cloudinary.client.js';
import { CloudinaryService } from '../src/shared/services/cloudinary/cloudinary.service.js';

// 1x1 transparent PNG buffer
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function main(): Promise<void> {
  console.log('--- TEST D\'INTÉGRATION CLOUDINARY RÉEL ---');

  if (!cloudinaryConfig.isEnabled) {
    console.error(
      '❌ ERREUR: La configuration Cloudinary est incomplète dans .env (cloudName, apiKey ou apiSecret manquant).'
    );
    process.exit(1);
  }

  console.log(`ℹ️ CloudName configuré : ${cloudinaryConfig.cloudName}`);
  console.log(`ℹ️ API Key configurée   : ${cloudinaryConfig.apiKey}`);
  console.log('ℹ️ API Secret           : [MASQUÉ / PROTÉGÉ]');

  let uploadedPublicId: string | null = null;
  let resourceType: 'image' | 'raw' = 'image';

  try {
    const client = createCloudinaryClient(cloudinaryConfig);
    const service = new CloudinaryService(client);

    console.log('\n1. Upload d\'une image PNG de test en mémoire...');
    const uploadResult = await service.uploadImage(TINY_PNG_BUFFER, {
      domain: 'media',
      mimeType: 'image/png',
      bytes: TINY_PNG_BUFFER.length,
    });

    uploadedPublicId = uploadResult.publicId;
    resourceType = uploadResult.resourceType as 'image' | 'raw';

    console.log('✅ Upload réussi !');
    console.log(`   - Public ID : ${uploadResult.publicId}`);
    console.log(`   - Format    : ${uploadResult.format}`);
    console.log(`   - Taille    : ${uploadResult.bytes} octets`);
    console.log(`   - URL       : ${uploadResult.secureUrl}`);

    console.log('\n2. Vérification des métadonnées de l\'asset...');
    const metadata = await service.getAssetMetadata(uploadResult.publicId, resourceType);
    console.log('✅ Métadonnées récupérées avec succès !');
    console.log(`   - Asset ID  : ${metadata.assetId ?? 'N/A'}`);

    console.log('\n3. Suppression immédiate de l\'asset de test...');
    await service.deleteAsset(uploadResult.publicId, resourceType);
    console.log('✅ Suppression réussie !');
    uploadedPublicId = null;

    console.log('\n🎉 TEST RÉEL CLOUDINARY RÉUSSI AVEC SUCCÈS ! Aucun asset résiduel.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ÉCHEC DU TEST CLOUDINARY RÉEL :');
    if (error instanceof Error) {
      console.error(`   Message : ${error.message}`);
      console.error(`   Nom     : ${error.name}`);
    } else {
      console.error('   Erreur inconnue:', error);
    }

    if (uploadedPublicId) {
      console.log(`\n🧹 Tentative de nettoyage de secours pour : ${uploadedPublicId}...`);
      try {
        const client = createCloudinaryClient(cloudinaryConfig);
        const service = new CloudinaryService(client);
        await service.deleteAsset(uploadedPublicId, resourceType);
        console.log('✅ Nettoyage de secours réussi.');
      } catch (cleanupErr) {
        console.error(
          '⚠️ Le nettoyage de secours a échoué. Veuillez vérifier manuellement le publicId:',
          uploadedPublicId
        );
      }
    }

    process.exit(1);
  }
}

void main();
