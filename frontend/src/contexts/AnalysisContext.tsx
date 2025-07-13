'use client';

import { createContext, useContext, useReducer, ReactNode } from 'react';
import { AnalysisState, AnalysisAction } from '@/types/analysis';

const initialState: AnalysisState = {
  step1Data: null,
  step2Data: null,
  step3Data: null,
  step4Data: null,
  step5Data: null,
  step6Data: null,
  step7Data: null,
};

function analysisReducer(state: AnalysisState, action: AnalysisAction): AnalysisState {
  switch (action.type) {
    case 'SET_STEP1_DATA':
      return { ...state, step1Data: action.payload };
    case 'SET_STEP2_DATA':
      return { ...state, step2Data: action.payload };
    case 'SET_STEP3_DATA':
      return { ...state, step3Data: action.payload };
    case 'SET_STEP4_DATA':
      return { ...state, step4Data: action.payload };
    case 'SET_STEP5_DATA':
      return { ...state, step5Data: action.payload };
    case 'SET_STEP6_DATA':
      return { ...state, step6Data: action.payload };
    case 'SET_STEP7_DATA':
      return { ...state, step7Data: action.payload };
    case 'RESET_ALL':
      return initialState;
    default:
      return state;
  }
}

interface AnalysisContextType {
  state: AnalysisState;
  dispatch: React.Dispatch<AnalysisAction>;
}

const AnalysisContext = createContext<AnalysisContextType | undefined>(undefined);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(analysisReducer, initialState);

  return (
    <AnalysisContext.Provider value={{ state, dispatch }}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  const context = useContext(AnalysisContext);
  if (context === undefined) {
    throw new Error('useAnalysis must be used within an AnalysisProvider');
  }
  return context;
} 