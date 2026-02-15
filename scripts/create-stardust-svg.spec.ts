import { defaultConfig, generateSVG, parseArgs } from './create-stardust-svg';

import type { Config } from './create-stardust-svg';

describe('create-stardust-svg', () => {
  const mockProcessExit = vi
    .spyOn(process, 'exit')
    .mockImplementation((code?: number | string | null | undefined) => {
      throw new Error(`Process exited with code ${code}`);
    }) as unknown as ReturnType<typeof vi.spyOn>;

  const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const mockConsoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('defaultConfig', () => {
    it('should have correct default dimensions', () => {
      expect(defaultConfig.width).toBe(500);
      expect(defaultConfig.height).toBe(1000);
    });

    it('should have correct default output filename', () => {
      expect(defaultConfig.output).toBe('particles.svg');
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

    it('should parse --width flag', () => {
      const config = parseArgs(['--width', '800']);
      expect(config.width).toBe(800);
    });

    it('should parse --height flag', () => {
      const config = parseArgs(['--height', '1600']);
      expect(config.height).toBe(1600);
    });

    it('should parse --bg-color flag', () => {
      const config = parseArgs(['--bg-color', '#1a1a1a']);
      expect(config.bgColor).toBe('#1a1a1a');
    });

    it('should parse --output flag', () => {
      const config = parseArgs(['--output', 'custom.svg']);
      expect(config.output).toBe('custom.svg');
    });

    it('should parse -o shorthand for output', () => {
      const config = parseArgs(['-o', 'short.svg']);
      expect(config.output).toBe('short.svg');
    });

    it('should parse --dots flag', () => {
      const config = parseArgs(['--dots', '10']);
      expect(config.particleCounts.dot).toBe(10);
    });

    it('should parse --diamonds flag', () => {
      const config = parseArgs(['--diamonds', '12']);
      expect(config.particleCounts.diamond).toBe(12);
    });

    it('should parse --triangles flag', () => {
      const config = parseArgs(['--triangles', '6']);
      expect(config.particleCounts.triangle).toBe(6);
    });

    it('should parse --wedges flag', () => {
      const config = parseArgs(['--wedges', '15']);
      expect(config.particleCounts.wedge).toBe(15);
    });

    it('should parse --crescents flag', () => {
      const config = parseArgs(['--crescents', '7']);
      expect(config.particleCounts.crescent).toBe(7);
    });

    it('should parse --arcs flag', () => {
      const config = parseArgs(['--arcs', '9']);
      expect(config.particleCounts.arc).toBe(9);
    });

    it('should parse --brightness-min flag', () => {
      const config = parseArgs(['--brightness-min', '0.3']);
      expect(config.brightnessMin).toBe(0.3);
    });

    it('should parse --brightness-max flag', () => {
      const config = parseArgs(['--brightness-max', '0.8']);
      expect(config.brightnessMax).toBe(0.8);
    });

    it('should parse --scale-min flag', () => {
      const config = parseArgs(['--scale-min', '1.0']);
      expect(config.scaleMin).toBe(1.0);
    });

    it('should parse --scale-max flag', () => {
      const config = parseArgs(['--scale-max', '3.5']);
      expect(config.scaleMax).toBe(3.5);
    });

    it('should parse multiple flags together', () => {
      const config = parseArgs([
        '--width',
        '1200',
        '--height',
        '2400',
        '--dots',
        '20',
        '--bg-color',
        'navy',
        '-o',
        'multi.svg',
      ]);

      expect(config.width).toBe(1200);
      expect(config.height).toBe(2400);
      expect(config.particleCounts.dot).toBe(20);
      expect(config.bgColor).toBe('navy');
      expect(config.output).toBe('multi.svg');
    });

    it('should not mutate defaultConfig', () => {
      parseArgs(['--width', '9999', '--dots', '100']);

      expect(defaultConfig.width).toBe(500);
      expect(defaultConfig.particleCounts.dot).toBe(4);
    });

    it('should exit with code 1 for unknown -- options', () => {
      expect(() => parseArgs(['--unknown-flag'])).toThrow('Process exited with code 1');
      expect(mockConsoleError).toHaveBeenCalledWith('Unknown option: --unknown-flag');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should ignore non-flag arguments that do not start with --', () => {
      const config = parseArgs(['somefile.txt']);
      expect(config).toEqual(expect.objectContaining({ width: defaultConfig.width }));
    });

    it('should exit with code 0 for --help flag', () => {
      expect(() => parseArgs(['--help'])).toThrow('Process exited with code 0');
      expect(mockConsoleInfo).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should exit with code 0 for -h flag', () => {
      expect(() => parseArgs(['-h'])).toThrow('Process exited with code 0');
      expect(mockConsoleInfo).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should keep other particle counts at default when only one is changed', () => {
      const config = parseArgs(['--dots', '50']);

      expect(config.particleCounts.dot).toBe(50);
      expect(config.particleCounts.diamond).toBe(defaultConfig.particleCounts.diamond);
      expect(config.particleCounts.triangle).toBe(defaultConfig.particleCounts.triangle);
      expect(config.particleCounts.wedge).toBe(defaultConfig.particleCounts.wedge);
      expect(config.particleCounts.crescent).toBe(defaultConfig.particleCounts.crescent);
      expect(config.particleCounts.arc).toBe(defaultConfig.particleCounts.arc);
    });

    it('should parse all particle counts together', () => {
      const config = parseArgs([
        '--dots',
        '1',
        '--diamonds',
        '2',
        '--triangles',
        '3',
        '--wedges',
        '4',
        '--crescents',
        '5',
        '--arcs',
        '6',
      ]);

      expect(config.particleCounts).toEqual({
        dot: 1,
        diamond: 2,
        triangle: 3,
        wedge: 4,
        crescent: 5,
        arc: 6,
      });
    });

    it('should parse all range flags together', () => {
      const config = parseArgs([
        '--brightness-min',
        '0.2',
        '--brightness-max',
        '0.7',
        '--scale-min',
        '0.8',
        '--scale-max',
        '4.0',
      ]);

      expect(config.brightnessMin).toBe(0.2);
      expect(config.brightnessMax).toBe(0.7);
      expect(config.scaleMin).toBe(0.8);
      expect(config.scaleMax).toBe(4.0);
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
      const config: Config = { ...defaultConfig, width: 800, height: 1600 };
      const svg = generateSVG(config);

      expect(svg).toContain('viewBox="0 0 800 1600"');
    });

    it('should apply background color', () => {
      const config: Config = { ...defaultConfig, bgColor: '#1a1a1a' };
      const svg = generateSVG(config);

      expect(svg).toContain('style="background: #1a1a1a"');
    });

    it('should include particle shape definitions in defs', () => {
      const svg = generateSVG(defaultConfig);

      expect(svg).toContain('<defs>');
      expect(svg).toContain('id="particle-dot"');
      expect(svg).toContain('id="particle-diamond"');
      expect(svg).toContain('id="particle-triangle"');
      expect(svg).toContain('id="particle-wedge"');
      expect(svg).toContain('id="particle-crescent"');
      expect(svg).toContain('id="particle-arc"');
      expect(svg).toContain('</defs>');
    });

    it('should include texture-stardust group', () => {
      const svg = generateSVG(defaultConfig);

      expect(svg).toContain('<g id="texture-stardust">');
      expect(svg).toContain('</g>');
    });

    it('should generate correct number of particle comments', () => {
      const svg = generateSVG(defaultConfig);

      expect(svg).toContain('<!-- dot particles: 4 -->');
      expect(svg).toContain('<!-- diamond particles: 5 -->');
      expect(svg).toContain('<!-- triangle particles: 2 -->');
      expect(svg).toContain('<!-- wedge particles: 8 -->');
      expect(svg).toContain('<!-- crescent particles: 3 -->');
      expect(svg).toContain('<!-- arc particles: 3 -->');
    });

    it('should generate use elements referencing particle defs', () => {
      const svg = generateSVG(defaultConfig);

      expect(svg).toContain('href="#particle-dot"');
      expect(svg).toContain('href="#particle-diamond"');
      expect(svg).toContain('href="#particle-triangle"');
      expect(svg).toContain('href="#particle-wedge"');
      expect(svg).toContain('href="#particle-crescent"');
      expect(svg).toContain('href="#particle-arc"');
    });

    it('should include transform attributes on use elements', () => {
      const svg = generateSVG(defaultConfig);

      expect(svg).toContain('transform="scale(');
      expect(svg).toContain('rotate(');
      expect(svg).toContain('translate(');
    });

    it('should include opacity attributes', () => {
      const svg = generateSVG(defaultConfig);

      expect(svg).toContain('opacity="');
    });

    it('should include oklch color values', () => {
      const svg = generateSVG(defaultConfig);

      expect(svg).toContain('color="oklch(');
    });

    it('should generate zero particles when all counts are zero', () => {
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

      expect(svg).toContain('<!-- dot particles: 0 -->');
      expect(svg).not.toContain('href="#particle-dot"');
    });

    it('should produce deterministic output when Math.random is mocked', () => {
      const svg1 = generateSVG(defaultConfig);
      const svg2 = generateSVG(defaultConfig);

      expect(svg1).toBe(svg2);
    });

    it('should use the default background color from config', () => {
      const svg = generateSVG(defaultConfig);

      expect(svg).toContain('style="background: black"');
    });

    it('should include circle shape for dot particles', () => {
      const svg = generateSVG(defaultConfig);

      expect(svg).toContain('<circle cx="0" cy="1.25" r="1.25" fill="currentColor"/>');
    });

    it('should include path shapes for non-dot particles', () => {
      const svg = generateSVG(defaultConfig);

      // Diamond path
      expect(svg).toContain('M0,2.5 L1.615,1.923 L3,1.25 L1.615,0.577 L0,0 L0,1.25 Z');
      // Triangle path
      expect(svg).toContain('M1.25,1.5 L1.923,0.808 L2.5,0 L1.25,0 L0,0 L0.577,0.808 Z');
    });
  });
});
