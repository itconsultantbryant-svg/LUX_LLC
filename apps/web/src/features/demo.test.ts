import { describe, expect, it } from 'vitest';
import { demoReducer, initialDemo, parseAmount } from './demo';
import { isDemoDeployment } from '../config';
describe('synthetic wallet boundaries', () => {
  it('exposes demo entry only in demo deployments', () => {
    expect(isDemoDeployment('demo')).toBe(true);
    for (const env of ['development', 'test', 'production'] as const)
      expect(isDemoDeployment(env)).toBe(false);
  });
  it('does not spend restricted or pending funds', () => {
    const state = demoReducer(initialDemo, { type: 'start' });
    expect(
      demoReducer(state, {
        type: 'complete',
        flow: 'pay',
        amount: state.available + 1,
        detail: 'example',
      }),
    ).toBe(state);
    const paid = demoReducer(state, {
      type: 'complete',
      flow: 'pay',
      amount: state.available,
      detail: 'example',
    });
    expect(paid.available).toBe(0);
    expect(paid.restricted).toBe(state.restricted);
    expect(paid.pending).toBe(state.pending);
  });
  it('keeps requests pending and records completed savings and payments', () => {
    const state = demoReducer(initialDemo, { type: 'start' });
    const requested = demoReducer(state, {
      type: 'complete',
      flow: 'support',
      amount: 10001,
      detail: 'example',
    });
    expect(requested.available).toBe(state.available);
    expect(requested.pending).toBe(state.pending + 10001);
    expect(requested.activity[0].status).toBe('Pending');
    const saved = demoReducer(requested, {
      type: 'complete',
      flow: 'save',
      amount: 10001,
      detail: 'example',
    });
    expect(saved.available).toBe(state.available + 10001);
    expect(saved.activity[0].status).toBe('Completed');
    expect(new Set(saved.activity.map((item) => item.id)).size).toBe(saved.activity.length);
  });
  it('rejects invalid amounts and inactive sessions', () => {
    for (const amount of [-1, 0, NaN, Infinity, 1.1, 100000001])
      expect(
        demoReducer(
          { ...initialDemo, active: true },
          { type: 'complete', flow: 'save', amount, detail: 'example' },
        ).available,
      ).toBe(initialDemo.available);
    expect(
      demoReducer(initialDemo, { type: 'complete', flow: 'save', amount: 100, detail: 'example' }),
    ).toBe(initialDemo);
  });
  it('clears synthetic activity on exit', () => {
    expect(demoReducer({ ...initialDemo, active: true, available: 1 }, { type: 'exit' })).toEqual(
      initialDemo,
    );
  });
  it('parses currency without accepting exponents or fractional cents', () => {
    expect(parseAmount('12.34')).toBe(1234);
    expect(parseAmount('0.01')).toBe(1);
    for (const value of ['', '-1', '1e3', '1.001', '0', 'Infinity', '1,000', '1000001'])
      expect(parseAmount(value)).toBeNull();
  });
});
