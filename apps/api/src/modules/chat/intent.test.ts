import { describe, expect, it } from 'vitest';
import { classifyIntent, extractAmountMinor } from './intent.js';

describe('classifyIntent', () => {
  it('recognises greetings', () => {
    expect(classifyIntent('hi')).toBe('greeting');
    expect(classifyIntent('Good afternoon')).toBe('greeting');
  });

  it('prioritises top-up intent over the generic wallet match', () => {
    expect(classifyIntent('add money from Orange Money')).toBe('add_funds');
    expect(classifyIntent('top up my wallet by 2000')).toBe('add_funds');
    expect(classifyIntent('move 5000 from orange money to my health wallet')).toBe('add_funds');
  });

  it('recognises emergency requests', () => {
    expect(classifyIntent('I need the nearest hospital right now')).toBe('emergency');
    expect(classifyIntent('someone is bleeding')).toBe('emergency');
  });

  it('recognises provider, support, fees and briefing questions', () => {
    expect(classifyIntent('find a pharmacy near me')).toBe('provider');
    expect(classifyIntent("I can't afford this bill, help")).toBe('support');
    expect(classifyIntent('how much do you charge in fees')).toBe('fees');
    expect(classifyIntent('what should I do next')).toBe('briefing');
  });

  it('falls back to unknown for unrelated text', () => {
    expect(classifyIntent('purple monkey dishwasher')).toBe('unknown');
  });
});

describe('extractAmountMinor', () => {
  it('reads whole currency units as minor units', () => {
    expect(extractAmountMinor('add 500')).toBe('50000');
    expect(extractAmountMinor('top up L$5,000')).toBe('500000');
  });

  it('reads decimals', () => {
    expect(extractAmountMinor('add 12.50')).toBe('1250');
  });

  it('returns null when there is no amount', () => {
    expect(extractAmountMinor('add money please')).toBeNull();
    expect(extractAmountMinor('')).toBeNull();
  });
});
