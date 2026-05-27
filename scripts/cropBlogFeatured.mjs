import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const imagePath = process.argv[2];

if (!imagePath) {
  console.error('Please provide an image path as an argument.');
  process.exit(1);
}

async function run() {
  try {
    const resolvedPath = path.resolve(imagePath);
    
    // Check if file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      console.error(`File not found: ${resolvedPath}`);
      process.exit(1);
    }

    const tempPath = resolvedPath.replace(/\.(png|jpg|jpeg)$/i, (match) => `-temp${match}`);
    
    await sharp(resolvedPath)
      .resize(1200, 628, {
        fit: 'cover',
        position: 'center'
      })
      .toFile(tempPath);
      
    await fs.rename(tempPath, resolvedPath);
    console.log(`[crop] Successfully cropped image to 1200x628: ${resolvedPath}`);
  } catch (error) {
    console.error('[crop] Error cropping image:', error);
    process.exit(1);
  }
}

run();
