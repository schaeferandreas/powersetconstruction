/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Play, ChevronRight, RotateCcw, Info, Settings2, Download, Upload, Sigma } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NFA, DFA, DFAState, DFATransition, StateId, Symbol } from './types';
import { powersetConstruction, getDFAStateId, getNextNFAStates, isFinalDFAState } from './lib/powerset';
import AutomatonGraph from './components/AutomatonGraph';

const DEFAULT_NFA: NFA = {
  states: ['q0', 'q1', 'q2'],
  alphabet: ['a', 'b'],
  transitions: {
    'q0': { 'a': ['q0', 'q1'], 'b': ['q0'] },
    'q1': { 'a': [], 'b': ['q2'] },
    'q2': { 'a': [], 'b': [] }
  },
  startStates: ['q0'],
  finalStates: ['q2']
};

export default function App() {
  const [nfa, setNfa] = useState<NFA>(DEFAULT_NFA);
  const [activeTab, setActiveTab] = useState<'edit' | 'construct' | 'result'>('edit');
  const [showAddSymbolInput, setShowAddSymbolInput] = useState(false);
  const [newSymbolValue, setNewSymbolValue] = useState('');
  
  // Construction state
  const [dfaStates, setDfaStates] = useState<DFAState[]>([]);
  const [dfaTransitions, setDfaTransitions] = useState<DFATransition[]>([]);
  const [processedStates, setProcessedStates] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<string[]>([]);
  const [userSelectedStates, setUserSelectedStates] = useState<StateId[]>([]);
  const [constructionPhase, setConstructionPhase] = useState<'idle' | 'selecting'>('idle');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [currentStep, setCurrentStep] = useState<{
    stateId: string;
    symbol: Symbol;
    nextNFAStates: StateId[];
    nextDFAId: string;
    isNew: boolean;
  } | null>(null);

  const resetConstruction = () => {
    const startNFAStates = nfa.startStates.slice().sort();
    const startDFAId = getDFAStateId(startNFAStates);
    
    setDfaStates([{
      id: startDFAId,
      nfaStates: startNFAStates,
      isStart: true,
      isFinal: isFinalDFAState(startNFAStates, nfa.finalStates),
    }]);
    setDfaTransitions([]);
    setProcessedStates(new Set());
    setQueue([startDFAId]);
    setCurrentStep(null);
    setUserSelectedStates([]);
    setConstructionPhase('idle');
    setFeedback(null);
  };

  const stepConstruction = () => {
    if (queue.length === 0) return;

    const currentId = queue[0];
    const alphabet = nfa.alphabet;
    
    // Find first unprocessed symbol for current state
    const currentTransitions = dfaTransitions.filter(t => t.from === currentId);
    const processedSymbols = currentTransitions.map(t => t.symbol);
    const nextSymbol = alphabet.find(s => !processedSymbols.includes(s));

    if (nextSymbol) {
      const currentState = dfaStates.find(s => s.id === currentId)!;
      const nextNFAStates = getNextNFAStates(currentState.nfaStates, nextSymbol, nfa.transitions);
      const nextDFAId = getDFAStateId(nextNFAStates);
      const isNew = !dfaStates.some(s => s.id === nextDFAId);

      setCurrentStep({
        stateId: currentId,
        symbol: nextSymbol,
        nextNFAStates,
        nextDFAId,
        isNew
      });
      setConstructionPhase('selecting');
      setUserSelectedStates([]);
      setFeedback(null);
    } else {
      // All symbols processed for this state
      setProcessedStates(prev => new Set(prev).add(currentId));
      setQueue(prev => prev.slice(1));
      setCurrentStep(null);
    }
  };

  const checkSelection = () => {
    if (!currentStep) return;

    const sortedSelected = [...userSelectedStates].sort();
    const sortedTarget = [...currentStep.nextNFAStates].sort();
    
    const isCorrect = JSON.stringify(sortedSelected) === JSON.stringify(sortedTarget);

    if (isCorrect) {
      setFeedback({ message: 'Correct! Transition added.', type: 'success' });
      
      // Update transitions
      setDfaTransitions(prev => [...prev, { 
        from: currentStep.stateId, 
        symbol: currentStep.symbol, 
        to: currentStep.nextDFAId 
      }]);
      
      // Update states if new
      if (currentStep.isNew) {
        setDfaStates(prev => [...prev, {
          id: currentStep.nextDFAId,
          nfaStates: currentStep.nextNFAStates,
          isStart: false,
          isFinal: isFinalDFAState(currentStep.nextNFAStates, nfa.finalStates),
        }]);
        setQueue(prev => [...prev, currentStep.nextDFAId]);
      }

      setConstructionPhase('idle');
    } else {
      setFeedback({ message: 'Incorrect selection. Try again.', type: 'error' });
    }
  };

  const runToCompletion = () => {
    const result = powersetConstruction(nfa);
    setDfaStates(result.states);
    setDfaTransitions(result.transitions);
    setProcessedStates(new Set(result.states.map(s => s.id)));
    setQueue([]);
    setCurrentStep(null);
    setConstructionPhase('idle');
    setFeedback(null);
    setUserSelectedStates([]);
  };

  // NFA Editor helpers
  const addState = () => {
    const newId = `q${nfa.states.length}`;
    setNfa(prev => ({
      ...prev,
      states: [...prev.states, newId],
      transitions: { ...prev.transitions, [newId]: {} }
    }));
  };

  const removeState = (id: string) => {
    setNfa(prev => {
      const newStates = prev.states.filter(s => s !== id);
      const newTransitions = { ...prev.transitions };
      delete newTransitions[id];
      // Clean up references in other transitions
      Object.keys(newTransitions).forEach(s => {
        Object.keys(newTransitions[s]).forEach(sym => {
          newTransitions[s][sym] = newTransitions[s][sym].filter(target => target !== id);
        });
      });
      return {
        ...prev,
        states: newStates,
        transitions: newTransitions,
        startStates: prev.startStates.filter(s => s !== id),
        finalStates: prev.finalStates.filter(s => s !== id)
      };
    });
  };

  const addSymbol = () => {
    if (newSymbolValue && !nfa.alphabet.includes(newSymbolValue)) {
      setNfa(prev => ({
        ...prev,
        alphabet: [...prev.alphabet, newSymbolValue]
      }));
      setNewSymbolValue('');
      setShowAddSymbolInput(false);
    }
  };

  const removeSymbol = (sym: string) => {
    setNfa(prev => {
      const newAlphabet = prev.alphabet.filter(s => s !== sym);
      const newTransitions = { ...prev.transitions };
      
      // Remove transitions for this symbol from all states
      Object.keys(newTransitions).forEach(stateId => {
        const stateTransitions = { ...newTransitions[stateId] };
        delete stateTransitions[sym];
        newTransitions[stateId] = stateTransitions;
      });

      return {
        ...prev,
        alphabet: newAlphabet,
        transitions: newTransitions
      };
    });
  };

  const toggleTransition = (from: string, sym: string, to: string) => {
    setNfa(prev => {
      const current = prev.transitions[from]?.[sym] || [];
      const next = current.includes(to) 
        ? current.filter(s => s !== to)
        : [...current, to];
      
      return {
        ...prev,
        transitions: {
          ...prev.transitions,
          [from]: {
            ...(prev.transitions[from] || {}),
            [sym]: next
          }
        }
      };
    });
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-b border-[#141414] p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight uppercase">Powerset Construction Lab</h1>
          <p className="text-[10px] md:text-xs opacity-60 font-mono mt-1">NFA to DFA Conversion • Rabin-Scott Algorithm</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button 
            onClick={() => setActiveTab('edit')}
            className={`flex-1 md:flex-none px-3 md:px-4 py-2 text-[10px] md:text-xs font-bold uppercase border border-[#141414] transition-colors ${activeTab === 'edit' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414] hover:text-[#E4E3E0]'}`}
          >
            1. Define NFA
          </button>
          <button 
            onClick={() => { setActiveTab('construct'); resetConstruction(); }}
            className={`flex-1 md:flex-none px-3 md:px-4 py-2 text-[10px] md:text-xs font-bold uppercase border border-[#141414] transition-colors ${activeTab === 'construct' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414] hover:text-[#E4E3E0]'}`}
          >
            2. Construct
          </button>
          <button 
            onClick={() => { setActiveTab('result'); runToCompletion(); }}
            className={`flex-1 md:flex-none px-3 md:px-4 py-2 text-[10px] md:text-xs font-bold uppercase border border-[#141414] transition-colors ${activeTab === 'result' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414] hover:text-[#E4E3E0]'}`}
          >
            3. Final DFA
          </button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Controls/Input */}
        <div className="lg:col-span-4 space-y-6">
          {activeTab === 'edit' && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <section className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-serif italic text-lg">States & Alphabet</h2>
                  <div className="flex gap-2">
                    <button onClick={addState} className="p-1 hover:bg-gray-100 rounded border border-gray-200" title="Add State"><Plus size={16} /></button>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold opacity-50 block mb-2">States</label>
                    <div className="flex flex-wrap gap-2">
                      {nfa.states.map(s => (
                        <div key={s} className="flex items-center gap-1 bg-gray-50 border border-gray-200 px-2 py-1 rounded text-xs">
                          <span>{s}</span>
                          <button onClick={() => removeState(s)} className="text-red-500 hover:text-red-700"><Trash2 size={12} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] uppercase font-bold opacity-50 block">Alphabet</label>
                      <button 
                        onClick={() => setShowAddSymbolInput(!showAddSymbolInput)} 
                        className="p-1 hover:bg-gray-100 rounded border border-gray-200 flex items-center justify-center" 
                        title="Add Symbol"
                      >
                        <div className="relative flex items-center justify-center w-4 h-4">
                          <Sigma size={14} />
                          <Plus size={8} className="absolute -top-1 -right-1 text-[#141414] font-bold" />
                        </div>
                      </button>
                    </div>
                    
                    <AnimatePresence>
                      {showAddSymbolInput && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="mb-3 overflow-hidden"
                        >
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              value={newSymbolValue}
                              onChange={(e) => setNewSymbolValue(e.target.value)}
                              placeholder="Enter symbol (e.g. 'c')"
                              className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-[#141414]"
                              onKeyDown={(e) => e.key === 'Enter' && addSymbol()}
                              autoFocus
                            />
                            <button 
                              onClick={addSymbol}
                              className="px-3 py-1 bg-[#141414] text-[#E4E3E0] text-[10px] font-bold uppercase rounded"
                            >
                              Add
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="flex flex-wrap gap-2">
                      {nfa.alphabet.map(s => (
                        <div key={s} className="flex items-center gap-1 bg-gray-50 border border-gray-200 px-2 py-1 rounded text-xs font-mono">
                          <span>{s}</span>
                          <button onClick={() => removeSymbol(s)} className="text-red-500 hover:text-red-700 ml-1"><Trash2 size={12} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                <h2 className="font-serif italic text-lg mb-4">Transitions</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="border p-2 bg-gray-50">δ</th>
                        {nfa.alphabet.map(sym => (
                          <th key={sym} className="border p-2 bg-gray-50 font-mono">{sym}</th>
                        ))}
                        <th className="border p-2 bg-gray-50">Start</th>
                        <th className="border p-2 bg-gray-50">Final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nfa.states.map(from => (
                        <tr key={from}>
                          <td className="border p-2 font-bold">{from}</td>
                          {nfa.alphabet.map(sym => (
                            <td key={sym} className="border p-1">
                              <div className="flex flex-wrap gap-1">
                                {nfa.states.map(to => (
                                  <button
                                    key={to}
                                    onClick={() => toggleTransition(from, sym, to)}
                                    className={`px-1 rounded border ${nfa.transitions[from]?.[sym]?.includes(to) ? 'bg-[#141414] text-white border-[#141414]' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'}`}
                                  >
                                    {to}
                                  </button>
                                ))}
                              </div>
                            </td>
                          ))}
                          <td className="border p-2 text-center">
                            <input 
                              type="checkbox" 
                              checked={nfa.startStates.includes(from)}
                              onChange={() => {
                                setNfa(prev => ({
                                  ...prev,
                                  startStates: prev.startStates.includes(from) 
                                    ? prev.startStates.filter(s => s !== from)
                                    : [...prev.startStates, from]
                                }));
                              }}
                            />
                          </td>
                          <td className="border p-2 text-center">
                            <input 
                              type="checkbox" 
                              checked={nfa.finalStates.includes(from)}
                              onChange={() => {
                                setNfa(prev => ({
                                  ...prev,
                                  finalStates: prev.finalStates.includes(from) 
                                    ? prev.finalStates.filter(s => s !== from)
                                    : [...prev.finalStates, from]
                                }));
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'construct' && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <section className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                <h2 className="font-serif italic text-lg mb-4">Construction Status</h2>
                
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <button 
                      onClick={stepConstruction}
                      disabled={queue.length === 0 || constructionPhase === 'selecting'}
                      className="flex-1 bg-[#141414] text-white py-2 px-4 text-xs font-bold uppercase flex items-center justify-center gap-2 disabled:opacity-30"
                    >
                      <ChevronRight size={16} /> {constructionPhase === 'selecting' ? 'Selecting...' : 'Next Step'}
                    </button>
                    <button 
                      onClick={runToCompletion}
                      disabled={queue.length === 0 || constructionPhase === 'selecting'}
                      className="bg-white border border-[#141414] py-2 px-4 text-xs font-bold uppercase flex items-center justify-center gap-2 disabled:opacity-30"
                    >
                      <Play size={16} /> Finish
                    </button>
                    <button 
                      onClick={resetConstruction}
                      className="bg-white border border-[#141414] py-2 px-4 text-xs font-bold uppercase flex items-center justify-center"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>

                  {feedback && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }} 
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-3 text-xs font-bold border ${feedback.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}
                    >
                      {feedback.message}
                    </motion.div>
                  )}

                  <div className="border-t border-dashed border-gray-200 pt-4">
                    <label className="text-[10px] uppercase font-bold opacity-50 block mb-2">Queue (Unprocessed)</label>
                    <div className="flex flex-wrap gap-2">
                      {queue.length > 0 ? queue.map((s, i) => (
                        <span key={i} className={`px-2 py-1 rounded text-xs font-mono border ${i === 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
                          {s}
                        </span>
                      )) : <span className="text-xs italic text-gray-400">Queue empty</span>}
                    </div>
                  </div>

                  {currentStep && (
                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg space-y-4 animate-in fade-in slide-in-from-left-2">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-blue-800 uppercase tracking-wider">Current Action</p>
                        <p className="text-sm">
                          From <span className="font-mono font-bold">{currentStep.stateId}</span> with symbol <span className="font-mono font-bold">'{currentStep.symbol}'</span>:
                        </p>
                      </div>

                      {constructionPhase === 'selecting' ? (
                        <div className="space-y-3 bg-white p-3 border border-blue-200 rounded">
                          <p className="text-[10px] font-bold uppercase opacity-60">Select the target NFA states:</p>
                          <div className="flex flex-wrap gap-2">
                            {nfa.states.map(stateId => (
                              <button
                                key={stateId}
                                onClick={() => {
                                  setUserSelectedStates(prev => 
                                    prev.includes(stateId) 
                                      ? prev.filter(s => s !== stateId) 
                                      : [...prev, stateId]
                                  );
                                }}
                                className={`px-3 py-1 rounded text-xs font-mono border transition-all ${
                                  userSelectedStates.includes(stateId)
                                    ? 'bg-[#141414] text-white border-[#141414]'
                                    : 'bg-white text-[#141414] border-gray-200 hover:border-[#141414]'
                                }`}
                              >
                                {stateId}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={checkSelection}
                            className="w-full bg-blue-600 text-white py-2 text-[10px] font-bold uppercase rounded hover:bg-blue-700 transition-colors"
                          >
                            Check Selection
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs">
                          <div className="bg-white px-2 py-1 rounded border border-blue-200 font-mono">
                            ∪ δ(q, {currentStep.symbol}) = {currentStep.nextDFAId || '∅'}
                          </div>
                          {currentStep.isNew && (
                            <span className="text-[10px] text-green-600 font-bold uppercase">✨ New state!</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              <section className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                <h2 className="font-serif italic text-lg mb-4">DFA States</h2>
                <div className="space-y-2">
                  {dfaStates.map(s => (
                    <div key={s.id} className={`p-2 border rounded flex justify-between items-center ${processedStates.has(s.id) ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-[#141414]'}`}>
                      <span className="text-xs font-mono font-bold">{s.id}</span>
                      <div className="flex gap-1">
                        {s.isStart && <span className="text-[8px] bg-blue-100 text-blue-700 px-1 rounded font-bold uppercase">Start</span>}
                        {s.isFinal && <span className="text-[8px] bg-green-100 text-green-700 px-1 rounded font-bold uppercase">Final</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'result' && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <section className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                <h2 className="font-serif italic text-lg mb-4">DFA Summary</h2>
                <div className="space-y-4 text-xs">
                  <div className="flex justify-between">
                    <span className="opacity-50 uppercase font-bold">Total States</span>
                    <span className="font-mono">{dfaStates.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-50 uppercase font-bold">Transitions</span>
                    <span className="font-mono">{dfaTransitions.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-50 uppercase font-bold">Final States</span>
                    <span className="font-mono">{dfaStates.filter(s => s.isFinal).length}</span>
                  </div>
                </div>
              </section>
              
              <div className="bg-[#141414] text-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                <h2 className="font-serif italic text-lg mb-4 text-[#E4E3E0]">Theory Note</h2>
                <p className="text-xs leading-relaxed opacity-80">
                  The powerset construction shows that every NFA has an equivalent DFA. 
                  However, the number of states in the DFA can be up to 2<sup>n</sup> where n is the number of NFA states.
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Right Column: Visualization */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] min-h-[700px] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-serif italic text-xl">Visualization</h2>
              <div className="flex items-center gap-4 text-[10px] font-bold uppercase opacity-50">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-100 border border-blue-600"></div> Start</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full border-2 border-gray-800"></div> Final</div>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-6 min-w-0 overflow-hidden">
              <div className="flex-1 flex flex-col min-w-0 space-y-2">
                <h3 className="text-[10px] uppercase font-bold opacity-50">NFA (Input)</h3>
                <div className="flex-1 min-h-0 min-w-0">
                  <AutomatonGraph 
                    states={nfa.states}
                    transitions={Object.entries(nfa.transitions).flatMap(([from, syms]) => 
                      Object.entries(syms).flatMap(([sym, tos]) => 
                        tos.map(to => ({ from, to, label: sym }))
                      )
                    )}
                    highlightedStates={useMemo(() => {
                      if (!currentStep) return [];
                      const currentState = dfaStates.find(s => s.id === currentStep.stateId);
                      return currentState ? currentState.nfaStates : [];
                    }, [currentStep, dfaStates])}
                    highlightedTransitions={useMemo(() => {
                      if (!currentStep) return [];
                      const currentState = dfaStates.find(s => s.id === currentStep.stateId);
                      if (!currentState) return [];
                      
                      return currentState.nfaStates.flatMap(from => {
                        const targets = nfa.transitions[from]?.[currentStep.symbol] || [];
                        return targets.map(to => ({ from, to, label: currentStep.symbol }));
                      });
                    }, [currentStep, dfaStates, nfa.transitions])}
                    startStates={nfa.startStates}
                    finalStates={nfa.finalStates}
                    height={325}
                  />
                </div>
              </div>

              <div className="flex-1 flex flex-col min-w-0 space-y-2">
                <h3 className="text-[10px] uppercase font-bold opacity-50">DFA (Construction)</h3>
                <div className="flex-1 min-h-0 min-w-0">
                  <AutomatonGraph 
                    states={dfaStates.map(s => s.id)}
                    transitions={dfaTransitions.map(t => ({ from: t.from, to: t.to, label: t.symbol }))}
                    highlightedStates={currentStep ? [currentStep.stateId] : []}
                    highlightedTransitions={currentStep ? [{ from: currentStep.stateId, to: currentStep.nextDFAId, label: currentStep.symbol }] : []}
                    startStates={dfaStates.filter(s => s.isStart).map(s => s.id)}
                    finalStates={dfaStates.filter(s => s.isFinal).map(s => s.id)}
                    height={325}
                    labelPosition="bottom"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
