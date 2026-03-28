/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NFA, DFA, DFAState, DFATransition, StateId, Symbol } from '../types';

/**
 * Converts a set of NFA states into a unique DFA state ID.
 */
export function getDFAStateId(states: StateId[]): string {
  if (states.length === 0) return "∅";
  return "{" + states.slice().sort().join(",") + "}";
}

/**
 * Checks if a DFA state is final (contains at least one NFA final state).
 */
export function isFinalDFAState(states: StateId[], nfaFinalStates: StateId[]): boolean {
  return states.some(s => nfaFinalStates.includes(s));
}

/**
 * Computes the next set of NFA states reachable from a given set of NFA states via a symbol.
 */
export function getNextNFAStates(
  currentStates: StateId[],
  symbol: Symbol,
  nfaTransitions: Record<StateId, Record<Symbol, StateId[]>>
): StateId[] {
  const nextStates = new Set<StateId>();
  for (const state of currentStates) {
    const reachable = nfaTransitions[state]?.[symbol] || [];
    for (const r of reachable) {
      nextStates.add(r);
    }
  }
  return Array.from(nextStates).sort();
}

/**
 * Performs the full powerset construction.
 */
export function powersetConstruction(nfa: NFA): DFA {
  const alphabet = nfa.alphabet;
  const startNFAStates = nfa.startStates.slice().sort();
  const startDFAId = getDFAStateId(startNFAStates);

  const dfaStates: DFAState[] = [
    {
      id: startDFAId,
      nfaStates: startNFAStates,
      isStart: true,
      isFinal: isFinalDFAState(startNFAStates, nfa.finalStates),
    },
  ];

  const dfaTransitions: DFATransition[] = [];
  const processedStates = new Set<string>();
  const queue: string[] = [startDFAId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (processedStates.has(currentId)) continue;
    processedStates.add(currentId);

    const currentState = dfaStates.find(s => s.id === currentId)!;
    const currentNFAStates = currentState.nfaStates;

    for (const symbol of alphabet) {
      const nextNFAStates = getNextNFAStates(currentNFAStates, symbol, nfa.transitions);
      const nextDFAId = getDFAStateId(nextNFAStates);

      // Add transition
      dfaTransitions.push({
        from: currentId,
        symbol,
        to: nextDFAId,
      });

      // Add new state if not exists
      if (!dfaStates.some(s => s.id === nextDFAId)) {
        dfaStates.push({
          id: nextDFAId,
          nfaStates: nextNFAStates,
          isStart: false,
          isFinal: isFinalDFAState(nextNFAStates, nfa.finalStates),
        });
        queue.push(nextDFAId);
      }
    }
  }

  return {
    states: dfaStates,
    alphabet,
    transitions: dfaTransitions,
  };
}
