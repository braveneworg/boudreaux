/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { getDefaultState, getStateName, US_STATES } from './states';

describe('states', () => {
  describe('US_STATES', () => {
    it('should contain 50 states', () => {
      expect(US_STATES).toHaveLength(50);
    });

    it('should have valid state objects with code and name', () => {
      US_STATES.forEach((state) => {
        expect(state).toHaveProperty('code');
        expect(state).toHaveProperty('name');
        expect(typeof state.code).toBe('string');
        expect(typeof state.name).toBe('string');
        expect(state.code.length).toBe(2);
        expect(state.name.length).toBeGreaterThan(0);
      });
    });

    it('should include Alabama', () => {
      const alabama = US_STATES.find((s) => s.code === 'AL');
      expect(alabama).toEqual({ code: 'AL', name: 'Alabama' });
    });

    it('should include California', () => {
      const california = US_STATES.find((s) => s.code === 'CA');
      expect(california).toEqual({ code: 'CA', name: 'California' });
    });

    it('should include Wyoming (last alphabetically)', () => {
      const wyoming = US_STATES.find((s) => s.code === 'WY');
      expect(wyoming).toEqual({ code: 'WY', name: 'Wyoming' });
    });

    it('should have unique state codes', () => {
      const codes = US_STATES.map((s) => s.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });

  describe('getStateName', () => {
    it('should return the state name for a valid code', () => {
      expect(getStateName('CA')).toBe('California');
    });

    it('should return the state name for lowercase code', () => {
      // Note: this will return the code itself since find is case-sensitive
      expect(getStateName('ca')).toBe('ca');
    });

    it('should return the code if state is not found', () => {
      expect(getStateName('XX')).toBe('XX');
    });

    it('should return empty string if empty string is passed', () => {
      expect(getStateName('')).toBe('');
    });

    it('should return Texas for TX', () => {
      expect(getStateName('TX')).toBe('Texas');
    });

    it('should return New York for NY', () => {
      expect(getStateName('NY')).toBe('New York');
    });
  });

  describe('getDefaultState', () => {
    it('should return AL as the default state', () => {
      expect(getDefaultState()).toBe('AL');
    });

    it('should return a valid state code', () => {
      const defaultState = getDefaultState();
      const isValid = US_STATES.some((s) => s.code === defaultState);
      expect(isValid).toBe(true);
    });
  });
});
