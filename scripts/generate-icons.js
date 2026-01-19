#!/usr/bin/env node

/**
 * Generate PNG icons from SVG for Chrome Extension
 * Requires: npm install sharp
 */

const fs = require("fs");
const path = require("path");

// Check if sharp is available
let sharp;
try {
  sharp = require("sharp");
} catch (err) {
  console.error("Error: sharp is not installed.");
  console.error("Please run: npm install --save-dev sharp");
  process.exit(1);
}

const sizes = [16, 48, 128];
const inputSvg = path.join(__dirname, "../assets/icons/logo.svg");
const outputDir = path.join(__dirname, "../assets/icons");

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcons() {
  console.log("Generating Chrome extension icons...\n");

  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon-${size}.png`);

    try {
      await sharp(inputSvg).resize(size, size).png().toFile(outputPath);

      console.log(`✓ Generated ${size}x${size} icon: ${outputPath}`);
    } catch (err) {
      console.error(`✗ Failed to generate ${size}x${size} icon:`, err.message);
    }
  }

  console.log("\n✓ Icon generation complete!");
}

generateIcons().catch((err) => {
  console.error("Error generating icons:", err);
  process.exit(1);
});
