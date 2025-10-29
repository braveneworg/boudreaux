import React, { useState } from 'react';

const StardustSVG = ({
  width = 1000,
  height = 2000,
  bgColor = 'black',
  particleColor = 'white',
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
          opacity={brightness.toFixed(2)}
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
      style={{
        width: '100%',
        height: 'auto',
        border: '1px solid #333',
        background: bgColor,
      }}
    >
      <defs>
        {Object.entries(particleShapes).map(([type, shape]) => (
          <g fill="#FFFFFF" key={type} id={`particle-${type}`}>
            {shape}
          </g>
        ))}
      </defs>
      <g id="texture-stardust">{allParticles}</g>
    </svg>
  );
};

// Demo component with controls
export default function StardustDemo() {
  const [counts, setCounts] = useState({
    dot: 4,
    diamond: 5,
    triangle: 2,
    wedge: 8,
    crescent: 3,
    arc: 3,
  });

  const [brightnessRange, setBrightnessRange] = useState([0.1, 0.95]);
  const [scaleRange, setScaleRange] = useState([0.5, 2.0]);
  const [bgColor, setBgColor] = useState('black');
  const [seed, setSeed] = useState(0);

  const updateCount = (type, value) => {
    setCounts((prev) => ({ ...prev, [type]: Math.max(0, parseInt(value) || 0) }));
  };

  const totalParticles = Object.values(counts).reduce((sum, count) => sum + count, 0);

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif', background: '#f5f5f5' }}>
      <h1 style={{ marginBottom: '10px' }}>Stardust SVG Generator</h1>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Total particles: <strong>{totalParticles}</strong> | Adjust counts per particle type
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '15px',
          marginBottom: '20px',
        }}
      >
        {Object.entries(counts).map(([type, count]) => (
          <div
            key={type}
            style={{
              background: 'white',
              padding: '12px',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
          >
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                textTransform: 'capitalize',
                fontWeight: '500',
              }}
            >
              {type}: {count}
            </label>
            <input
              type="range"
              min="0"
              max="20"
              value={count}
              onChange={(e) => updateCount(type, e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        ))}
      </div>

      <div
        style={{
          background: 'white',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Global Parameters</h3>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
            Background Color
          </label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="color"
              value={bgColor === 'black' ? '#000000' : bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              style={{
                width: '60px',
                height: '40px',
                cursor: 'pointer',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
            <input
              type="text"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              placeholder="e.g., black, #000000, rgb(0,0,0)"
              style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
            Brightness Range: {brightnessRange[0].toFixed(2)} - {brightnessRange[1].toFixed(2)}
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={brightnessRange[0]}
              onChange={(e) => setBrightnessRange([parseFloat(e.target.value), brightnessRange[1]])}
              style={{ flex: 1 }}
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={brightnessRange[1]}
              onChange={(e) => setBrightnessRange([brightnessRange[0], parseFloat(e.target.value)])}
              style={{ flex: 1 }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
            Scale Range: {scaleRange[0].toFixed(2)} - {scaleRange[1].toFixed(2)}
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={scaleRange[0]}
              onChange={(e) => setScaleRange([parseFloat(e.target.value), scaleRange[1]])}
              style={{ flex: 1 }}
            />
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={scaleRange[1]}
              onChange={(e) => setScaleRange([scaleRange[0], parseFloat(e.target.value)])}
              style={{ flex: 1 }}
            />
          </div>
        </div>

        <button
          onClick={() => setSeed(seed + 1)}
          style={{
            padding: '10px 20px',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '500',
          }}
        >
          Regenerate (New Random Positions)
        </button>
      </div>

      <div
        style={{
          background: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        <StardustSVG
          key={seed}
          particleCounts={counts}
          brightnessRange={brightnessRange}
          scaleRange={scaleRange}
          bgColor={bgColor}
        />
      </div>

      <div
        style={{ marginTop: '20px', padding: '15px', background: '#e3f2fd', borderRadius: '8px' }}
      >
        <h3 style={{ marginTop: 0 }}>How to Export</h3>
        <p>
          Right-click the SVG above and "Save image as..." or inspect the element and copy the SVG
          markup to save as a .svg file.
        </p>
      </div>
    </div>
  );
}
