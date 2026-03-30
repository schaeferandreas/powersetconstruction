/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Play, ChevronRight, RotateCcw, Info, Settings2, Download, Upload, Sigma, Languages } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();
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

  // Simulation state
  const [simWord, setSimWord] = useState('');
  const [simStep, setSimStep] = useState(0);

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
      setFeedback({ message: t('correct_feedback'), type: 'success' });
      
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
      setFeedback({ message: t('incorrect_feedback'), type: 'error' });
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
    setSimStep(0);
  };

  const simPath = useMemo(() => {
    if (!dfaStates.length) return [];
    
    const startState = dfaStates.find(s => s.isStart);
    if (!startState) return [];
    
    let currentId = startState.id;
    const path = [currentId];
    
    for (const char of simWord) {
      const transition = dfaTransitions.find(t => t.from === currentId && t.symbol === char);
      if (transition) {
        currentId = transition.to;
        path.push(currentId);
      } else {
        // If it's a valid symbol but no transition, it might go to the empty set state if it exists
        const emptySetId = getDFAStateId([]);
        if (nfa.alphabet.includes(char) && dfaStates.some(s => s.id === emptySetId)) {
          currentId = emptySetId;
          path.push(currentId);
        } else {
          break;
        }
      }
    }
    return path;
  }, [simWord, dfaStates, dfaTransitions, nfa.alphabet]);

  const currentSimDFAState = simPath[simStep];
  const currentSimNFAStates = useMemo(() => {
    if (!currentSimDFAState) return [];
    return dfaStates.find(s => s.id === currentSimDFAState)?.nfaStates || [];
  }, [currentSimDFAState, dfaStates]);

  const isWordValid = useMemo(() => {
    return Array.from(simWord).every(char => nfa.alphabet.includes(char));
  }, [simWord, nfa.alphabet]);

  const isWordAccepted = useMemo(() => {
    if (simStep !== simWord.length || !currentSimDFAState) return false;
    return dfaStates.find(s => s.id === currentSimDFAState)?.isFinal || false;
  }, [simStep, simWord.length, currentSimDFAState, dfaStates]);

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
    <div className="min-h-screen bg-th-white text-th-black font-sans selection:bg-th-rot selection:text-th-white">
      {/* Header */}
      <header className="border-b border-th-black p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-th-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex flex-col md:flex-row md:items-center gap-4 w-full md:w-auto">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight uppercase text-th-rot">{t('app_title')}</h1>
            <p className="text-[10px] md:text-xs opacity-60 font-mono mt-1">{t('app_subtitle')}</p>
          </div>
          
          <div className="flex items-center gap-2 bg-th-sand/10 border border-th-sand/30 px-2 py-1 rounded">
            <Languages size={14} className="text-th-dunkelblau" />
            <select 
              value={i18n.language} 
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="bg-transparent text-[10px] font-bold uppercase focus:outline-none cursor-pointer"
            >
              <option value="en">EN</option>
              <option value="de">DE</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button 
            onClick={() => setActiveTab('edit')}
            className={`flex-1 md:flex-none px-3 md:px-4 py-2 text-[10px] md:text-xs font-bold uppercase border border-th-black transition-colors ${activeTab === 'edit' ? 'bg-th-rot text-th-white border-th-rot' : 'hover:bg-th-rot hover:text-th-white hover:border-th-rot'}`}
          >
            {t('tab_define')}
          </button>
          <button 
            onClick={() => { setActiveTab('construct'); resetConstruction(); }}
            className={`flex-1 md:flex-none px-3 md:px-4 py-2 text-[10px] md:text-xs font-bold uppercase border border-th-black transition-colors ${activeTab === 'construct' ? 'bg-th-rot text-th-white border-th-rot' : 'hover:bg-th-rot hover:text-th-white hover:border-th-rot'}`}
          >
            {t('tab_construct')}
          </button>
          <button 
            onClick={() => { setActiveTab('result'); runToCompletion(); }}
            className={`flex-1 md:flex-none px-3 md:px-4 py-2 text-[10px] md:text-xs font-bold uppercase border border-th-black transition-colors ${activeTab === 'result' ? 'bg-th-rot text-th-white border-th-rot' : 'hover:bg-th-rot hover:text-th-white hover:border-th-rot'}`}
          >
            {t('tab_final')}
          </button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Controls/Input */}
        <div className="lg:col-span-4 space-y-6">
          {activeTab === 'edit' && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <section className="bg-th-white p-6 border border-th-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-serif italic text-lg text-th-dunkelblau">{t('states_alphabet')}</h2>
                  <div className="flex gap-2">
                    <button onClick={addState} className="p-1 hover:bg-th-sand/20 rounded border border-th-sand/30" title={t('add_state')}><Plus size={16} /></button>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold opacity-50 block mb-2">{t('states')}</label>
                    <div className="flex flex-wrap gap-2">
                      {nfa.states.map(s => (
                        <div key={s} className="flex items-center gap-1 bg-th-sand/10 border border-th-sand/30 px-2 py-1 rounded text-xs">
                          <span>{s}</span>
                          <button onClick={() => removeState(s)} className="text-th-rot hover:text-th-rot/80"><Trash2 size={12} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] uppercase font-bold opacity-50 block">{t('alphabet')}</label>
                      <button 
                        onClick={() => setShowAddSymbolInput(!showAddSymbolInput)} 
                        className="p-1 hover:bg-th-sand/20 rounded border border-th-sand/30 flex items-center justify-center" 
                        title={t('add_symbol')}
                      >
                        <div className="relative flex items-center justify-center w-4 h-4">
                          <Sigma size={14} />
                          <Plus size={8} className="absolute -top-1 -right-1 text-th-black font-bold" />
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
                              placeholder={t('enter_symbol')}
                              className="flex-1 text-xs px-2 py-1 border border-th-sand/30 rounded focus:outline-none focus:border-th-rot"
                              onKeyDown={(e) => e.key === 'Enter' && addSymbol()}
                              autoFocus
                            />
                            <button 
                              onClick={addSymbol}
                              className="px-3 py-1 bg-th-rot text-th-white text-[10px] font-bold uppercase rounded"
                            >
                              {t('add')}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="flex flex-wrap gap-2">
                      {nfa.alphabet.map(s => (
                        <div key={s} className="flex items-center gap-1 bg-th-sand/10 border border-th-sand/30 px-2 py-1 rounded text-xs font-mono">
                          <span>{s}</span>
                          <button onClick={() => removeSymbol(s)} className="text-th-rot hover:text-th-rot/80 ml-1"><Trash2 size={12} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="bg-th-white p-6 border border-th-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <h2 className="font-serif italic text-lg mb-4 text-th-dunkelblau">{t('transitions')}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="border border-th-sand/30 p-2 bg-th-sand/5">δ</th>
                        {nfa.alphabet.map(sym => (
                          <th key={sym} className="border border-th-sand/30 p-2 bg-th-sand/5 font-mono">{sym}</th>
                        ))}
                        <th className="border border-th-sand/30 p-2 bg-th-sand/5">{t('start')}</th>
                        <th className="border border-th-sand/30 p-2 bg-th-sand/5">{t('final')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nfa.states.map(from => (
                        <tr key={from}>
                          <td className="border border-th-sand/30 p-2 font-bold bg-th-sand/5">{from}</td>
                          {nfa.alphabet.map(sym => (
                            <td key={sym} className="border border-th-sand/30 p-1">
                              <div className="flex flex-wrap gap-1">
                                {nfa.states.map(to => (
                                  <button
                                    key={to}
                                    onClick={() => toggleTransition(from, sym, to)}
                                    className={`px-1 rounded border transition-colors ${nfa.transitions[from]?.[sym]?.includes(to) ? 'bg-th-rot text-th-white border-th-rot' : 'bg-th-white text-th-grau border-th-sand/30 hover:border-th-rot'}`}
                                  >
                                    {to}
                                  </button>
                                ))}
                              </div>
                            </td>
                          ))}
                          <td className="border border-th-sand/30 p-2 text-center">
                            <input 
                              type="checkbox" 
                              className="accent-th-rot"
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
                          <td className="border border-th-sand/30 p-2 text-center">
                            <input 
                              type="checkbox" 
                              className="accent-th-rot"
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
              <section className="bg-th-white p-6 border border-th-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <h2 className="font-serif italic text-lg mb-4 text-th-dunkelblau">{t('construction_status')}</h2>
                
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <button 
                      onClick={stepConstruction}
                      disabled={queue.length === 0 || constructionPhase === 'selecting'}
                      className="flex-1 bg-th-rot text-th-white py-2 px-4 text-xs font-bold uppercase flex items-center justify-center gap-2 disabled:opacity-30 hover:bg-th-rot/90 transition-colors"
                    >
                      <ChevronRight size={16} /> {constructionPhase === 'selecting' ? t('selecting') : t('next_step')}
                    </button>
                    <button 
                      onClick={runToCompletion}
                      disabled={queue.length === 0 || constructionPhase === 'selecting'}
                      className="bg-th-white border border-th-black py-2 px-4 text-xs font-bold uppercase flex items-center justify-center gap-2 disabled:opacity-30 hover:bg-th-sand/10 transition-colors"
                      title={t('finish')}
                    >
                      <Play size={16} />
                    </button>
                    <button 
                      onClick={resetConstruction}
                      className="bg-th-white border border-th-black py-2 px-4 text-xs font-bold uppercase flex items-center justify-center hover:bg-th-sand/10 transition-colors"
                      title={t('reset')}
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>

                  {feedback && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }} 
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-3 text-xs font-bold border ${feedback.type === 'success' ? 'bg-th-mint/20 border-th-mint text-th-grau' : 'bg-th-rot/10 border-th-rot text-th-rot'}`}
                    >
                      {feedback.message}
                    </motion.div>
                  )}

                  <div className="border-t border-dashed border-th-sand/30 pt-4">
                    <label className="text-[10px] uppercase font-bold opacity-50 block mb-2">{t('queue')}</label>
                    <div className="flex flex-wrap gap-2">
                      {queue.length > 0 ? queue.map((s, i) => (
                        <span key={i} className={`px-2 py-1 rounded text-xs font-mono border ${i === 0 ? 'bg-th-goldgelb/20 border-th-goldgelb' : 'bg-th-sand/10 border-th-sand/30'}`}>
                          {s}
                        </span>
                      )) : <span className="text-xs italic text-th-grau/50">{t('queue_empty')}</span>}
                    </div>
                  </div>

                  {currentStep && (
                    <div className="bg-th-blaugrau/10 border border-th-blaugrau/20 p-4 rounded-lg space-y-4 animate-in fade-in slide-in-from-left-2">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-th-dunkelblau uppercase tracking-wider">{t('current_action')}</p>
                        <p className="text-sm">
                          {t('from')} <span className="font-mono font-bold">{currentStep.stateId}</span> {t('with_symbol')} <span className="font-mono font-bold">'{currentStep.symbol}'</span>:
                        </p>
                      </div>

                      {constructionPhase === 'selecting' ? (
                        <div className="space-y-3 bg-th-white p-3 border border-th-blaugrau/20 rounded">
                          <p className="text-[10px] font-bold uppercase opacity-60">{t('select_target_states')}</p>
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
                                    ? 'bg-th-rot text-th-white border-th-rot'
                                    : 'bg-th-white text-th-black border-th-sand/30 hover:border-th-rot'
                                }`}
                              >
                                {stateId}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={checkSelection}
                            className="w-full bg-th-dunkelblau text-th-white py-2 text-[10px] font-bold uppercase rounded hover:bg-th-dunkelblau/90 transition-colors"
                          >
                            {t('check_selection')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs">
                          <div className="bg-th-white px-2 py-1 rounded border border-th-blaugrau/20 font-mono">
                            ∪ δ(q, {currentStep.symbol}) = {currentStep.nextDFAId || t('empty_set')}
                          </div>
                          {currentStep.isNew && (
                            <span className="text-[10px] text-th-apfelgruen font-bold uppercase">{t('new_state')}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              <section className="bg-th-white p-6 border border-th-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <h2 className="font-serif italic text-lg mb-4 text-th-dunkelblau">{t('dfa_states')}</h2>
                <div className="space-y-2">
                  {dfaStates.map(s => (
                    <div key={s.id} className={`p-2 border rounded flex justify-between items-center ${processedStates.has(s.id) ? 'bg-th-sand/10 border-th-sand/30 opacity-60' : 'bg-th-white border-th-black'}`}>
                      <span className="text-xs font-mono font-bold">{s.id}</span>
                      <div className="flex gap-1">
                        {s.isStart && <span className="text-[8px] bg-th-blaugrau/20 text-th-dunkelblau px-1 rounded font-bold uppercase">{t('start')}</span>}
                        {s.isFinal && <span className="text-[8px] bg-th-mint/20 text-th-grau px-1 rounded font-bold uppercase border border-th-mint/30">{t('final')}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'result' && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <section className="bg-th-white p-6 border border-th-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <h2 className="font-serif italic text-lg mb-4 text-th-dunkelblau">{t('simulation')}</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold opacity-50 block mb-2">{t('simulation_word')}</label>
                    <input 
                      type="text"
                      value={simWord}
                      onChange={(e) => {
                        setSimWord(e.target.value);
                        setSimStep(0);
                      }}
                      placeholder={t('simulation_placeholder')}
                      className={`w-full text-xs px-3 py-2 border rounded focus:outline-none transition-colors ${!isWordValid && simWord ? 'border-th-rot bg-th-rot/5' : 'border-th-sand/30 focus:border-th-rot'}`}
                    />
                    {!isWordValid && simWord && (
                      <p className="text-[10px] text-th-rot font-bold mt-1 uppercase">{t('invalid_symbols')}</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => setSimStep(prev => Math.max(0, prev - 1))}
                      disabled={simStep === 0}
                      className="flex-1 bg-th-white border border-th-black py-2 px-4 text-[10px] font-bold uppercase flex items-center justify-center gap-2 disabled:opacity-30 hover:bg-th-sand/10 transition-colors"
                    >
                      {t('step_backward')}
                    </button>
                    <button 
                      onClick={() => setSimStep(prev => Math.min(simWord.length, prev + 1))}
                      disabled={simStep >= simWord.length || simStep >= simPath.length - 1}
                      className="flex-1 bg-th-rot text-th-white py-2 px-4 text-[10px] font-bold uppercase flex items-center justify-center gap-2 disabled:opacity-30 hover:bg-th-rot/90 transition-colors"
                    >
                      {t('step_forward')}
                    </button>
                  </div>

                  <button 
                    onClick={() => setSimStep(0)}
                    className="w-full bg-th-white border border-th-black py-2 px-4 text-[10px] font-bold uppercase flex items-center justify-center gap-2 hover:bg-th-sand/10 transition-colors"
                  >
                    <RotateCcw size={14} /> {t('reset_simulation')}
                  </button>

                  <div className="pt-4 border-t border-dashed border-th-sand/30">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] uppercase font-bold opacity-50">{t('current_step')}</span>
                      <span className="text-xs font-mono font-bold">{simStep} / {simWord.length}</span>
                    </div>
                    <div className="flex gap-1 overflow-x-auto pb-2">
                      {Array.from(simWord).map((char, i) => (
                        <span 
                          key={i} 
                          className={`flex-shrink-0 w-6 h-8 flex items-center justify-center border font-mono text-sm transition-colors ${i < simStep ? 'bg-th-dunkelblau text-th-white border-th-dunkelblau' : i === simStep ? 'bg-th-rot text-th-white border-th-rot animate-pulse' : 'bg-th-white border-th-sand/30'}`}
                        >
                          {char}
                        </span>
                      ))}
                    </div>
                  </div>

                  {simStep === simWord.length && simWord.length > 0 && (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={`p-4 border-2 text-center font-bold uppercase tracking-widest ${isWordAccepted ? 'bg-th-mint/10 border-th-mint text-th-grau' : 'bg-th-rot/10 border-th-rot text-th-rot'}`}
                    >
                      {isWordAccepted ? t('word_accepted') : t('word_rejected')}
                    </motion.div>
                  )}
                </div>
              </section>

              <section className="bg-th-white p-6 border border-th-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <h2 className="font-serif italic text-lg mb-4 text-th-dunkelblau">{t('dfa_summary')}</h2>
                <div className="space-y-4 text-xs">
                  <div className="flex justify-between">
                    <span className="opacity-50 uppercase font-bold">{t('total_states')}</span>
                    <span className="font-mono">{dfaStates.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-50 uppercase font-bold">{t('transitions')}</span>
                    <span className="font-mono">{dfaTransitions.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-50 uppercase font-bold">{t('final')} {t('states')}</span>
                    <span className="font-mono">{dfaStates.filter(s => s.isFinal).length}</span>
                  </div>
                </div>
              </section>
              
              <div className="bg-th-dunkelblau text-th-white p-6 border border-th-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <h2 className="font-serif italic text-lg mb-4 text-th-sand">{t('theory_note_title')}</h2>
                <p className="text-xs leading-relaxed opacity-80">
                  {t('theory_note_text')}
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Right Column: Visualization */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-th-white p-6 border border-th-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] min-h-[700px] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-serif italic text-xl text-th-dunkelblau">{t('visualization')}</h2>
              <div className="flex items-center gap-4 text-[10px] font-bold uppercase opacity-50">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-th-blaugrau/20 border border-th-dunkelblau"></div> {t('start')}</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full border-2 border-th-black"></div> {t('final')}</div>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-6 min-w-0 overflow-hidden">
              <div className="flex-1 flex flex-col min-w-0 space-y-2">
                <h3 className="text-[10px] uppercase font-bold opacity-50 text-th-dunkelblau">{t('nfa_input')}</h3>
                <div className="flex-1 min-h-0 min-w-0 bg-th-white border border-th-sand/20 rounded">
                  <AutomatonGraph 
                    states={nfa.states}
                    transitions={Object.entries(nfa.transitions).flatMap(([from, syms]) => 
                      Object.entries(syms).flatMap(([sym, tos]) => 
                        tos.map(to => ({ from, to, label: sym }))
                      )
                    )}
                    highlightedStates={useMemo(() => {
                      if (activeTab === 'result') return currentSimNFAStates;
                      if (!currentStep) return [];
                      const currentState = dfaStates.find(s => s.id === currentStep.stateId);
                      return currentState ? currentState.nfaStates : [];
                    }, [activeTab, currentSimNFAStates, currentStep, dfaStates])}
                    highlightedTransitions={useMemo(() => {
                      if (activeTab === 'result') {
                        if (simStep === 0 || !simPath[simStep-1]) return [];
                        const prevDFAStateId = simPath[simStep-1];
                        const prevNFAStates = dfaStates.find(s => s.id === prevDFAStateId)?.nfaStates || [];
                        const symbol = simWord[simStep-1];
                        
                        return prevNFAStates.flatMap(from => {
                          const targets = nfa.transitions[from]?.[symbol] || [];
                          return targets.map(to => ({ from, to, label: symbol }));
                        });
                      }
                      if (!currentStep) return [];
                      const currentState = dfaStates.find(s => s.id === currentStep.stateId);
                      if (!currentState) return [];
                      
                      return currentState.nfaStates.flatMap(from => {
                        const targets = nfa.transitions[from]?.[currentStep.symbol] || [];
                        return targets.map(to => ({ from, to, label: currentStep.symbol }));
                      });
                    }, [activeTab, simStep, simPath, dfaStates, simWord, currentStep, nfa.transitions])}
                    startStates={nfa.startStates}
                    finalStates={nfa.finalStates}
                    height={325}
                  />
                </div>
              </div>

              <div className="flex-1 flex flex-col min-w-0 space-y-2">
                <h3 className="text-[10px] uppercase font-bold opacity-50 text-th-dunkelblau">{t('dfa_construction')}</h3>
                <div className="flex-1 min-h-0 min-w-0 bg-th-white border border-th-sand/20 rounded">
                  <AutomatonGraph 
                    states={dfaStates.map(s => s.id)}
                    transitions={dfaTransitions.map(t => ({ from: t.from, to: t.to, label: t.symbol }))}
                    highlightedStates={useMemo(() => {
                      if (activeTab === 'result') return currentSimDFAState ? [currentSimDFAState] : [];
                      return currentStep ? [currentStep.stateId] : [];
                    }, [activeTab, currentSimDFAState, currentStep])}
                    highlightedTransitions={useMemo(() => {
                      if (activeTab === 'result') {
                        if (simStep === 0 || !simPath[simStep-1] || !simPath[simStep]) return [];
                        return [{ from: simPath[simStep-1], to: simPath[simStep], label: simWord[simStep-1] }];
                      }
                      return currentStep ? [{ from: currentStep.stateId, to: currentStep.nextDFAId, label: currentStep.symbol }] : [];
                    }, [activeTab, simStep, simPath, simWord, currentStep])}
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
