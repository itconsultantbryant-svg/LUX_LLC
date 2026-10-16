import { createContext, useContext } from 'react';
export type Flow = 'pay' | 'save' | 'support';
export type Activity = {
  id: number;
  title: string;
  amount: number;
  status: 'Completed' | 'Pending';
  detail: string;
};
export type DemoState = {
  active: boolean;
  available: number;
  restricted: number;
  pending: number;
  activity: Activity[];
};
export const initialDemo: DemoState = {
  active: false,
  available: 1250000,
  restricted: 450000,
  pending: 300000,
  activity: [
    {
      id: 1,
      title: 'Healthcare savings',
      amount: 250000,
      status: 'Completed',
      detail: 'Synthetic example · LRD savings added',
    },
    {
      id: 2,
      title: 'Care support request',
      amount: 300000,
      status: 'Pending',
      detail: 'Synthetic example · awaiting review',
    },
  ],
};
export type DemoAction =
  { type: 'start' | 'exit' } | { type: 'complete'; flow: Flow; amount: number; detail: string };
export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === 'start') return { ...initialDemo, active: true };
  if (action.type === 'exit') return initialDemo;
  if (
    action.type !== 'complete' ||
    !state.active ||
    !Number.isSafeInteger(action.amount) ||
    action.amount <= 0 ||
    action.amount > 100000000
  )
    return state;
  if (action.flow === 'pay' && action.amount > state.available) return state;
  return {
    ...state,
    available:
      state.available +
      (action.flow === 'save' ? action.amount : action.flow === 'pay' ? -action.amount : 0),
    pending: state.pending + (action.flow === 'support' ? action.amount : 0),
    activity: [
      {
        id: Math.max(...state.activity.map((item) => item.id), 0) + 1,
        title: { pay: 'Care payment', save: 'Healthcare savings', support: 'Care support request' }[
          action.flow
        ],
        amount: action.amount,
        status: action.flow === 'support' ? 'Pending' : 'Completed',
        detail: action.detail,
      },
      ...state.activity,
    ],
  };
}
export const DemoContext = createContext<{
  state: DemoState;
  dispatch: (action: DemoAction) => void;
  allowed: boolean;
}>({ state: initialDemo, dispatch: () => {}, allowed: false });
export const useDemo = () => useContext(DemoContext);
export const money = (cents: number) =>
  `LRD ${(cents / 100).toLocaleString('en-LR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function parseAmount(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 100000000 ? cents : null;
}
