#!/usr/bin/env node

/**
 * Stardust SVG Generator
 * A parameterized TypeScript CLI utility for generating stardust texture SVGs
 *
 * Usage: npx tsx generate-stardust.ts [options]
 * Or: node --loader ts-node/esm generate-stardust.ts [options]
 * Or compile and run: tsc generate-stardust.ts && node generate-stardust.js [options]
 */

import * as fs from 'fs';
import * as path from 'path';

interface ParticleCounts {
  dot: number;
  diamond: number;
  triangle: number;
  wedge: number;
  crescent: number;
  arc: number;
}

interface Config {
  width: number;
  height: number;
  output: string;
  bgColor: string;
  particleCounts: ParticleCounts;
  brightnessMin: number;
  brightnessMax: number;
  scaleMin: number;
  scaleMax: number;
}

// Default configuration
const defaultConfig: Config = {
  width: 500,
  height: 1000,
  output: 'stardust.svg',
  bgColor: 'black',
  particleCounts: {
    dot: 4,
    diamond: 5,
    triangle: 2,
    wedge: 8,
    crescent: 3,
    arc: 3,
  },
  brightnessMin: 0.1,
  brightnessMax: 0.95,
  scaleMin: 0.5,
  scaleMax: 2.0,
};

// Particle shape definitions
const particleShapes: Record<keyof ParticleCounts, string> = {
  dot: '<circle cx="0" cy="1.25" r="1.25" fill="currentColor"/>',
  diamond:
    '<path d="M0,2.5 L1.615,1.923 L3,1.25 L1.615,0.577 L0,0 L0,1.25 Z" fill="currentColor"/>',
  triangle:
    '<path d="M1.25,1.5 L1.923,0.808 L2.5,0 L1.25,0 L0,0 L0.577,0.808 Z" fill="currentColor"/>',
  wedge:
    '<path d="M1.619,2 C1.81,2 2,1.5 2,1 L2,0 L0.952,0 L0,0 L0.571,1 C0.857,1.5 1.333,2 1.619,2 Z" fill="currentColor"/>',
  crescent:
    '<path d="M1.196,1.745 C1.957,1.312 2.5,0.773 2.5,0.449 C2.5,-0.414 1.522,0.017 0.761,1.312 L0,2.5 L1.196,1.745 Z" fill="currentColor"/>',
  arc: '<path d="M2,3 L1.4,1.539 C0.7,-0.215 0,-0.507 0,0.857 C0,1.441 0.4,2.123 1,2.416 L2,3 Z" fill="currentColor"/>',
};

// Utility functions
function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomIntInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate particles for a specific type
function generateParticles(type: keyof ParticleCounts, count: number, config: Config): string {
  const particles: string[] = [];

  for (let i = 0; i < count; i++) {
    const x = randomIntInRange(50, config.width - 50);
    const y = randomIntInRange(50, config.height - 50);
    const scaleX = randomInRange(config.scaleMin, config.scaleMax);
    const scaleY = randomInRange(config.scaleMin, config.scaleMax);
    const rotation = randomIntInRange(0, 360);
    const brightness = randomInRange(config.brightnessMin, config.brightnessMax);
    const lightness = randomInRange(0.14, 0.25);

    particles.push(
      `    <use href="#particle-${type}" ` +
        `transform="scale(${scaleX.toFixed(2)}, ${scaleY.toFixed(2)}) ` +
        `rotate(${rotation}, ${x}, ${y}) translate(${x}, ${y})" ` +
        `color="oklch(${lightness.toFixed(2)} 0 0)" ` +
        `opacity="${brightness.toFixed(2)}"/>`
    );
  }

  return particles.join('\n');
}

// Generate the complete SVG
function generateSVG(config: Config): string {
  const particleDefs = Object.entries(particleShapes)
    .map(([type, shape]) => `    <g id="particle-${type}">\n      ${shape}\n    </g>`)
    .join('\n\n');

  const particleElements = Object.entries(config.particleCounts)
    .map(([type, count]) => {
      const typedType = type as keyof ParticleCounts;
      return `    <!-- ${type} particles: ${count} -->\n${generateParticles(typedType, count, config)}`;
    })
    .join('\n\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${config.width} ${config.height}" style="background: ${config.bgColor}">
  <defs>
    <!-- Particle Shape Definitions -->
${particleDefs}
  </defs>

  <g id="texture-stardust">
${particleElements}
  </g>
</svg>`;
}

// Parse command line arguments
function parseArgs(args: string[]): Config {
  const config = { ...defaultConfig, particleCounts: { ...defaultConfig.particleCounts } };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];

    switch (arg) {
      case '--width':
        config.width = parseInt(value);
        i++;
        break;
      case '--height':
        config.height = parseInt(value);
        i++;
        break;
      case '--bg-color':
        config.bgColor = value;
        i++;
        break;
      case '--output':
      case '-o':
        config.output = value;
        i++;
        break;
      case '--dots':
        config.particleCounts.dot = parseInt(value);
        i++;
        break;
      case '--diamonds':
        config.particleCounts.diamond = parseInt(value);
        i++;
        break;
      case '--triangles':
        config.particleCounts.triangle = parseInt(value);
        i++;
        break;
      case '--wedges':
        config.particleCounts.wedge = parseInt(value);
        i++;
        break;
      case '--crescents':
        config.particleCounts.crescent = parseInt(value);
        i++;
        break;
      case '--arcs':
        config.particleCounts.arc = parseInt(value);
        i++;
        break;
      case '--brightness-min':
        config.brightnessMin = parseFloat(value);
        i++;
        break;
      case '--brightness-max':
        config.brightnessMax = parseFloat(value);
        i++;
        break;
      case '--scale-min':
        config.scaleMin = parseFloat(value);
        i++;
        break;
      case '--scale-max':
        config.scaleMax = parseFloat(value);
        i++;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        if (arg.startsWith('--')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return config;
}

// Print help message
function printHelp(): void {
  console.info(`
Stardust SVG Generator

Usage: npx tsx generate-stardust.ts [options]

Options:
  --width N              Canvas width (default: 1000)
  --height N             Canvas height (default: 2000)
  --bg-color COLOR       Background color (default: black)
  --output, -o FILE      Output filename (default: stardust.svg)

Particle counts:
  --dots N               Number of dot particles (default: 4)
  --diamonds N           Number of diamond particles (default: 5)
  --triangles N          Number of triangle particles (default: 2)
  --wedges N             Number of wedge particles (default: 8)
  --crescents N          Number of crescent particles (default: 3)
  --arcs N               Number of arc particles (default: 3)

Ranges:
  --brightness-min N     Min brightness/opacity (default: 0.1)
  --brightness-max N     Max brightness/opacity (default: 0.95)
  --scale-min N          Min scale factor (default: 0.5)
  --scale-max N          Max scale factor (default: 2.0)

Examples:
  npx tsx generate-stardust.ts
  npx tsx generate-stardust.ts --dots 10 --diamonds 8 --bg-color "#1a1a1a"
  npx tsx generate-stardust.ts --output custom-stardust.svg --wedges 15
  `);
}

// Main execution
function main(): void {
  const args = process.argv.slice(2);
  const config = parseArgs(args);

  // Generate SVG
  const svg = generateSVG(config);

  // Determine output path in public/media directory
  const mediaDir = path.resolve(process.cwd(), 'public/media');

  // Ensure the directory exists
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }

  // Default filename
  const baseFilename = 'stardust-on-slate';
  const extension = '.svg';

  // Find available filename with serial number if needed
  let outputFilename = `${baseFilename}${extension}`;
  let outputPath = path.join(mediaDir, outputFilename);
  let serialNumber = 1;

  while (fs.existsSync(outputPath)) {
    outputFilename = `${baseFilename}-${serialNumber}${extension}`;
    outputPath = path.join(mediaDir, outputFilename);
    serialNumber++;
  }

  // Write to file
  fs.writeFileSync(outputPath, svg, 'utf-8');

  // Calculate total particles
  const total = Object.values(config.particleCounts).reduce((sum, count) => sum + count, 0);

  // Print success message
  console.info('✨ Stardust SVG generated successfully!');
  console.info(`📄 File: ${outputPath}`);
  console.info(`📊 Total particles: ${total}`);
  console.info(
    `   └─ dots: ${config.particleCounts.dot}, diamonds: ${config.particleCounts.diamond}, triangles: ${config.particleCounts.triangle}`
  );
  console.info(
    `   └─ wedges: ${config.particleCounts.wedge}, crescents: ${config.particleCounts.crescent}, arcs: ${config.particleCounts.arc}`
  );
  console.info(`🎨 Background: ${config.bgColor}`);
  console.info(`📐 Dimensions: ${config.width}x${config.height}`);
  console.info(`✓ Brightness range: ${config.brightnessMin} - ${config.brightnessMax}`);
  console.info(`✓ Scale range: ${config.scaleMin} - ${config.scaleMax}`);
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for use as a module
export { generateSVG, parseArgs, defaultConfig };
export type { Config, ParticleCounts };
