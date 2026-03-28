/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type StateId = string;
export type Symbol = string;

export interface NFA {
  states: StateId[];
  alphabet: Symbol[];
  transitions: Record<StateId, Record<Symbol, StateId[]>>;
  startStates: StateId[];
  finalStates: StateId[];
}

export interface DFAState {
  id: string; // e.g. "{q0,q1}"
  nfaStates: StateId[]; // Sorted list of NFA states
  isStart: boolean;
  isFinal: boolean;
}

export interface DFATransition {
  from: string;
  symbol: Symbol;
  to: string;
}

export interface DFA {
  states: DFAState[];
  alphabet: Symbol[];
  transitions: DFATransition[];
}

export interface ConstructionStep {
  currentDFAState: string;
  symbol: Symbol;
  reachedNFAStates: StateId[];
  newDFAState: string;
  isNew: boolean;
}
