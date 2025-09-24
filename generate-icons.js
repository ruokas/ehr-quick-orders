const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

const sizes = [16, 32, 48, 128];

async function generateIcons() {
  const inputSvg = await fs.readFile(path.join(__dirname, 'icon.svg'));
  
  // Generate all icon sizes in parallel
  await Promise.all(sizes.map(async size => {
    await sharp(inputSvg)
      .resize(size, size)
      .png()
      .toFile(path.join(__dirname, `icon${size}.png`));
    console.log(`Generated ${size}x${size} icon`);
  }));
  
  console.log('All icons generated successfully!');
}

generateIcons().catch(console.error);