import { cn } from './tailwind-utils';

describe('tailwind-utils', () => {
  describe('cn (className utility)', () => {
    it('should merge class names', () => {
      const result = cn('class1', 'class2');
      expect(result).toBe('class1 class2');
    });

    it('should handle conditional classes', () => {
      const isTrue = true;
      const isFalse = false;
      const result = cn(
        'base-class',
        isTrue && 'conditional-class',
        isFalse && 'should-not-appear'
      );
      expect(result).toBe('base-class conditional-class');
    });

    it('should handle Tailwind conflicts properly', () => {
      const result = cn('p-4', 'p-2'); // Later padding should override
      expect(result).toBe('p-2');
    });

    it('should handle complex conditional logic', () => {
      const isActive = true;
      const isDisabled = false;
      const size = 'large' as 'large' | 'small';

      const result = cn('base-button', {
        'button-active': isActive,
        'button-disabled': isDisabled,
        'button-large': size === 'large',
        'button-small': size === 'small',
      });

      expect(result).toContain('base-button');
      expect(result).toContain('button-active');
      expect(result).toContain('button-large');
      expect(result).not.toContain('button-disabled');
      expect(result).not.toContain('button-small');
    });

    it('should handle arrays of classes', () => {
      const result = cn(['class1', 'class2'], ['class3', 'class4']);
      expect(result).toBe('class1 class2 class3 class4');
    });

    it('should handle undefined and null values', () => {
      const result = cn('class1', undefined, null, 'class2');
      expect(result).toBe('class1 class2');
    });

    it('should handle empty strings', () => {
      const result = cn('class1', '', 'class2');
      expect(result).toBe('class1 class2');
    });

    it('should handle nested arrays and objects', () => {
      const result = cn(
        'base',
        ['array-class1', 'array-class2'],
        {
          'object-class1': true,
          'object-class2': false,
        },
        'final-class'
      );

      expect(result).toContain('base');
      expect(result).toContain('array-class1');
      expect(result).toContain('array-class2');
      expect(result).toContain('object-class1');
      expect(result).toContain('final-class');
      expect(result).not.toContain('object-class2');
    });

    it('should return empty string for no arguments', () => {
      const result = cn();
      expect(result).toBe('');
    });

    it('should deduplicate identical classes', () => {
      const result = cn('class1', 'class2', 'class1', 'class3', 'class2');
      const classes = result.split(' ');
      const uniqueClasses = [...new Set(classes)];
      expect(classes.length).toBe(uniqueClasses.length);
      expect(result).toContain('class1');
      expect(result).toContain('class2');
      expect(result).toContain('class3');
    });
  });
});
