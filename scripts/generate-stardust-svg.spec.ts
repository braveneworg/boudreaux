import { defaultConfig, generateSVG, parseArgs } from './generate-stardust-svg';

import type { Config } from './generate-stardust-svg';

describe('generate-stardust-svg', () => {
  const mockProcessExit = vi
    .spyOn(process, 'exit')
    .mockImplementation((code?: number | string | null | undefined) => {
      throw new Error(`Process exited with code ${code}`);
    }) as unknown as ReturnType<typeof vi.spyOn>;

  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('defaultConfig', () => {
    it('should have correct default output filename (stardust.svg)', () => {
      expect(defaultConfig.output).toBe('stardust.svg');
    });

    it('should have correct default dimensions', () => {
      expect(defaultConfig.width).toBe(500);
      expect(defaultConfig.height).toBe(1000);
    });

    it('should have correct default particle counts', () => {
      expect(defaultConfig.particleCounts).toEqual({
        dot: 4,
        diamond: 5,
        triangle: 2,
        wedge: 8,
        crescent: 3,
        arc: 3,
      });
    });

    it('should have correct default brightness range', () => {
      expect(defaultConfig.brightnessMin).toBe(0.1);
      expect(defaultConfig.brightnessMax).toBe(0.95);
    });

    it('should have correct default scale range', () => {
      expect(defaultConfig.scaleMin).toBe(0.5);
      expect(defaultConfig.scaleMax).toBe(2.0);
    });

    it('should have correct default background color', () => {
      expect(defaultConfig.bgColor).toBe('black');
    });
  });

  describe('parseArgs', () => {
    it('should return default config when no args are provided', () => {
      const config = parseArgs([]);

      expect(config.width).toBe(defaultConfig.width);
      expect(config.height).toBe(defaultConfig.height);
      expect(config.output).toBe(defaultConfig.output);
      expect(config.bgColor).toBe(defaultConfig.bgColor);
      expect(config.particleCounts).toEqual(defaultConfig.particleCounts);
    });

    it('should parse --width and --height flags', () => {
      const config = parseArgs(['--width', '1200', '--height', '2400']);

      expect(config.width).toBe(1200);
      expect(config.height).toBe(2400);
    });

    it('should parse --bg-color flag', () => {
      const config = parseArgs(['--bg-color', '#222']);
      expect(config.bgColor).toBe('#222');
    });

    it('should parse --output flag', () => {
      const config = parseArgs(['--output', 'custom-stardust.svg']);
      expect(config.output).toBe('custom-stardust.svg');
    });

    it('should parse -o shorthand for output', () => {
      const config = parseArgs(['-o', 'short.svg']);
      expect(config.output).toBe('short.svg');
    });

    it('should parse all particle count flags', () => {
      const config = parseArgs([
        '--dots',
        '10',
        '--diamonds',
        '8',
        '--triangles',
        '6',
        '--wedges',
        '12',
        '--crescents',
        '4',
        '--arcs',
        '7',
      ]);

      expect(config.particleCounts).toEqual({
        dot: 10,
        diamond: 8,
        triangle: 6,
        wedge: 12,
        crescent: 4,
        arc: 7,
      });
    });

    it('should parse all range flags', () => {
      const config = parseArgs([
        '--brightness-min',
        '0.2',
        '--brightness-max',
        '0.8',
        '--scale-min',
        '0.75',
        '--scale-max',
        '3.0',
      ]);

      expect(config.brightnessMin).toBe(0.2);
      expect(config.brightnessMax).toBe(0.8);
      expect(config.scaleMin).toBe(0.75);
      expect(config.scaleMax).toBe(3.0);
    });

    it('should exit with code 1 for unknown -- options', () => {
      expect(() => parseArgs(['--bad-flag'])).toThrow('Process exited with code 1');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should exit with code 0 for --help', () => {
      expect(() => parseArgs(['--help'])).toThrow('Process exited with code 0');
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should exit with code 0 for -h', () => {
      expect(() => parseArgs(['-h'])).toThrow('Process exited with code 0');
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should not mutate defaultConfig', () => {
      parseArgs(['--width', '9999']);
      expect(defaultConfig.width).toBe(500);
    });

    it('should parse combined flags from all categories', () => {
      const config = parseArgs([
        '--width',
        '800',
        '--height',
        '1600',
        '--dots',
        '20',
        '--brightness-min',
        '0.3',
        '--scale-max',
        '5.0',
        '--bg-color',
        'darkblue',
        '-o',
        'combined.svg',
      ]);

      expect(config.width).toBe(800);
      expect(config.height).toBe(1600);
      expect(config.particleCounts.dot).toBe(20);
      expect(config.brightnessMin).toBe(0.3);
      expect(config.scaleMax).toBe(5.0);
      expect(config.bgColor).toBe('darkblue');
      expect(config.output).toBe('combined.svg');
    });
  });

  describe('generateSVG', () => {
    let mathRandomSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
      mathRandomSpy.mockRestore();
    });

    it('should generate valid SVG with XML declaration', () => {
      const svg = generateSVG(defaultConfig);

      expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    });

    it('should set correct viewBox dimensions', () => {
      const config: Config = { ...defaultConfig, width: 600, height: 1200 };
      const svg = generateSVG(config);

      expect(svg).toContain('viewBox="0 0 600 1200"');
    });

    it('should apply background color', () => {
      const config: Config = { ...defaultConfig, bgColor: '#333' };
      const svg = generateSVG(config);

      expect(svg).toContain('style="background: #333"');
    });

    it('should include all particle shape definitions', () => {
      const svg = generateSVG(defaultConfig);

      expect(svg).toContain('id="particle-dot"');
      expect(svg).toContain('id="particle-diamond"');
      expect(svg).toContain('id="particle-triangle"');
      expect(svg).toContain('id="particle-wedge"');
      expect(svg).toContain('id="particle-crescent"');
      expect(svg).toContain('id="particle-arc"');
    });

    it('should include particle comments with counts', () => {
      const svg = generateSVG(defaultConfig);

      expect(svg).toContain('<!-- dot particles: 4 -->');
      expect(svg).toContain('<!-- diamond particles: 5 -->');
      expect(svg).toContain('<!-- triangle particles: 2 -->');
      expect(svg).toContain('<!-- wedge particles: 8 -->');
      expect(svg).toContain('<!-- crescent particles: 3 -->');
      expect(svg).toContain('<!-- arc particles: 3 -->');
    });

    it('should generate use elements with transforms', () => {
      const svg = generateSVG(defaultConfig);

      expect(svg).toContain('href="#particle-dot"');
      expect(svg).toContain('transform="scale(');
      expect(svg).toContain('rotate(');
      expect(svg).toContain('translate(');
      expect(svg).toContain('opacity="');
      expect(svg).toContain('color="oklch(');
    });

    it('should generate zero particle use elements when counts are zero', () => {
      const config: Config = {
        ...defaultConfig,
        particleCounts: {
          dot: 0,
          diamond: 0,
          triangle: 0,
          wedge: 0,
          crescent: 0,
          arc: 0,
        },
      };
      const svg = generateSVG(config);

      expect(svg).not.toContain('href="#particle-dot"');
      expect(svg).not.toContain('href="#particle-diamond"');
    });

    it('should produce deterministic output with mocked Math.random', () => {
      const svg1 = generateSVG(defaultConfig);
      const svg2 = generateSVG(defaultConfig);

      expect(svg1).toBe(svg2);
    });

    it('should generate correct number of use elements for custom counts', () => {
      const config: Config = {
        ...defaultConfig,
        particleCounts: {
          dot: 2,
          diamond: 0,
          triangle: 0,
          wedge: 0,
          crescent: 0,
          arc: 0,
        },
      };
      const svg = generateSVG(config);

      const dotRefs = svg.match(/href="#particle-dot"/g);
      expect(dotRefs).toHaveLength(2);
    });
  });
});
