'use client';

import React, { useState, useSyncExternalStore } from 'react';

import { ContentContainer } from '@/app/components/ui/content-container';

type ParticleCounts = {
  dot: number;
  diamond: number;
  triangle: number;
  wedge: number;
  crescent: number;
  arc: number;
};

const ParticleGenerator = ({
  width = 1000,
  height = 2000,
  bgColor = 'black',
  bgOpacity = 1,
  particleColor = 'white',
  particleOpacity = 1,
  particleCounts = {
    dot: 4,
    diamond: 5,
    triangle: 2,
    wedge: 8,
    crescent: 3,
    arc: 3,
  },
  brightnessRange = [0.1, 0.95],
  scaleRange = [0.5, 2.0],
  seed = 0,
}) => {
  // Particle shape definitions
  const particleShapes = {
    dot: <circle cx="0" cy="1.25" r="1.25" fill="currentColor" />,
    diamond: (
      <path d="M0,2.5 L1.615,1.923 L3,1.25 L1.615,0.577 L0,0 L0,1.25 Z" fill="currentColor" />
    ),
    triangle: (
      <path d="M1.25,1.5 L1.923,0.808 L2.5,0 L1.25,0 L0,0 L0.577,0.808 Z" fill="currentColor" />
    ),
    wedge: (
      <path
        d="M1.619,2 C1.81,2 2,1.5 2,1 L2,0 L0.952,0 L0,0 L0.571,1 C0.857,1.5 1.333,2 1.619,2 Z"
        fill="currentColor"
      />
    ),
    crescent: (
      <path
        d="M1.196,1.745 C1.957,1.312 2.5,0.773 2.5,0.449 C2.5,-0.414 1.522,0.017 0.761,1.312 L0,2.5 L1.196,1.745 Z"
        fill="currentColor"
      />
    ),
    arc: (
      <path
        d="M2,3 L1.4,1.539 C0.7,-0.215 0,-0.507 0,0.857 C0,1.441 0.4,2.123 1,2.416 L2,3 Z"
        fill="currentColor"
      />
    ),
  };

  // Seeded random number generator for consistent randomization
  const seededRandom = (seedValue: number) => {
    let value = seedValue;
    return () => {
      value = (value * 9301 + 49297) % 233280;
      return value / 233280;
    };
  };

  const rng = seededRandom(seed);

  // Generate random value within range using seeded RNG
  const randomInRange = (min: number, max: number) => rng() * (max - min) + min;

  // Generate particles for a specific type
  const generateParticles = (type: string, count: number) => {
    return Array.from({ length: count }, (_, i) => {
      const x = randomInRange(50, width - 50);
      const y = randomInRange(50, height - 50);
      const scaleX = randomInRange(scaleRange[0], scaleRange[1]);
      const scaleY = randomInRange(scaleRange[0], scaleRange[1]);
      const rotation = randomInRange(0, 360);
      const brightness = randomInRange(brightnessRange[0], brightnessRange[1]);

      return (
        <use
          key={`${type}-${i}`}
          href={`#particle-${type}`}
          transform={`scale(${scaleX.toFixed(2)}, ${scaleY.toFixed(2)}) rotate(${rotation.toFixed(1)}, ${x.toFixed(0)}, ${y.toFixed(0)}) translate(${x.toFixed(0)}, ${y.toFixed(0)})`}
          color={particleColor}
          opacity={(brightness * particleOpacity).toFixed(2)}
        />
      );
    });
  };

  // Generate all particles
  const allParticles = Object.entries(particleCounts).flatMap(([type, count]) =>
    generateParticles(type, count)
  );

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto border border-gray-700"
    >
      <rect width={width} height={height} fill={bgColor} opacity={bgOpacity} />
      <defs>
        {Object.entries(particleShapes).map(([type, shape]) => (
          <g key={type} id={`particle-${type}`}>
            {shape}
          </g>
        ))}
      </defs>
      <g id="texture-particles">{allParticles}</g>
    </svg>
  );
};

// Demo component with controls
export default function ParticleGeneratorDemo() {
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [counts, setCounts] = useState({
    dot: 4,
    diamond: 5,
    triangle: 2,
    wedge: 8,
    crescent: 3,
    arc: 3,
  });

  const [brightnessRange, setBrightnessRange] = useState([0.1, 0.95]);
  const [scaleRange, setScaleRange] = useState([0.1, 5.0]);
  const [bgColor, setBgColor] = useState('black');
  const [bgOpacity, setBgOpacity] = useState(1);
  const [particleColor, setParticleColor] = useState('white');
  const [particleOpacity, setParticleOpacity] = useState(1);
  const [seed, setSeed] = useState(0);

  const updateCount = (type: keyof ParticleCounts, value: string) => {
    setCounts((prev) => ({ ...prev, [type]: Math.max(0, parseInt(value) || 0) }));
  };

  const totalParticles = Object.values(counts).reduce((sum, count) => sum + count, 0);

  if (!isClient) {
    return null;
  }

  return (
    <ContentContainer>
      <h1>Particle SVG Generator</h1>
      <p className="text-gray-600 mb-5">
        Total particles: <strong>{totalParticles}</strong> | Adjust counts per particle type
      </p>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 mb-5">
        {(Object.entries(counts) as [keyof ParticleCounts, number][]).map(([type, count]) => (
          <div key={type} className="bg-white p-4 rounded-lg shadow-sm">
            <label className="block mb-2 capitalize font-medium">
              {type}: {count}
            </label>
            <input
              type="range"
              min="0"
              max="500"
              value={count}
              onChange={(e) => updateCount(type, e.target.value)}
              className="w-full"
            />
            <input
              type="number"
              min="0"
              max="500"
              value={count}
              onChange={(e) => updateCount(type, e.target.value)}
              className="w-full mt-2 px-1 py-1 border border-gray-300 rounded"
            />
          </div>
        ))}
      </div>

      <div className="bg-white p-4 rounded-lg mb-5 shadow-sm">
        <h3 className="mt-0">Global Parameters</h3>

        <div className="mb-4">
          <div className="mb-4">
            <label className="block mb-1.5 font-medium">Particle Color</label>
            <div className="flex gap-2.5 items-center">
              <input
                type="color"
                value={particleColor === 'white' ? '#ffffff' : particleColor}
                onChange={(e) => setParticleColor(e.target.value)}
                className="w-[60px] h-10 cursor-pointer border border-gray-300 rounded"
              />
              <input
                type="text"
                value={particleColor}
                onChange={(e) => setParticleColor(e.target.value)}
                placeholder="e.g., white, #ffffff, rgb(255,255,255)"
                className="flex-1 px-2 py-2 border border-gray-300 rounded"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block mb-1.5 font-medium">
              Particle Opacity: {particleOpacity.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={particleOpacity}
              onChange={(e) => setParticleOpacity(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          <label className="block mb-1.5 font-medium">Background Color</label>
          <div className="flex gap-2.5 items-center">
            <input
              type="color"
              value={bgColor === 'black' ? '#000000' : bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="w-[60px] h-10 cursor-pointer border border-gray-300 rounded"
            />
            <input
              type="text"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              placeholder="e.g., black, #000000, rgb(0,0,0)"
              className="flex-1 px-2 py-2 border border-gray-300 rounded"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block mb-1.5 font-medium">
            Background Opacity: {bgOpacity.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={bgOpacity}
            onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="mb-4">
          <label className="block mb-1.5 font-medium">
            Brightness Range: {brightnessRange[0].toFixed(2)} - {brightnessRange[1].toFixed(2)}
          </label>
          <div className="flex gap-2.5">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={brightnessRange[0]}
              onChange={(e) => setBrightnessRange([parseFloat(e.target.value), brightnessRange[1]])}
              className="flex-1"
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={brightnessRange[1]}
              onChange={(e) => setBrightnessRange([brightnessRange[0], parseFloat(e.target.value)])}
              className="flex-1"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block mb-1.5 font-medium">
            Scale Range: {scaleRange[0].toFixed(2)} - {scaleRange[1].toFixed(2)}
          </label>
          <div className="flex gap-2.5">
            <input
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={scaleRange[0]}
              onChange={(e) => setScaleRange([parseFloat(e.target.value), scaleRange[1]])}
              className="flex-1"
            />
            <input
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={scaleRange[1]}
              onChange={(e) => setScaleRange([scaleRange[0], parseFloat(e.target.value)])}
              className="flex-1"
            />
          </div>
        </div>

        <button
          onClick={() => setSeed(seed + 1)}
          className="px-5 py-2.5 bg-blue-600 text-white border-0 rounded-md cursor-pointer font-medium hover:bg-blue-700 transition-colors"
        >
          Regenerate (New Random Positions)
        </button>
      </div>
      <div className="bg-white p-5 rounded-lg shadow-sm">
        <ParticleGenerator
          key={seed}
          particleCounts={counts}
          brightnessRange={brightnessRange}
          scaleRange={scaleRange}
          bgColor={bgColor}
          bgOpacity={bgOpacity}
          particleColor={particleColor}
          particleOpacity={particleOpacity}
          seed={seed}
        />
      </div>

      <div className="mt-5 p-4 bg-blue-50 rounded-lg">
        <h3 className="mt-0">How to Export</h3>
        <p>
          Right-click the SVG above and &quot;Save image as...&quot; or inspect the element and copy
          the SVG markup to save as a .svg file.
        </p>
      </div>
    </ContentContainer>
  );
}
