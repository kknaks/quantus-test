import { Stock, VolumeFilterType, StockRequest, StockResponse as BaseStockResponse, StockCandidatesResponse, BackTestResult } from './stock';

interface StatisticsData {
  count: number;
  mean: number;
  std: number;
  min: number;
  '25%': number;
  '50%': number;
  '75%': number;
  max: number;
}

export interface VolumeStatistics {
  tradingVolume: {
    count: number;
    mean: number;
    std: number;
    min: number;
    '25%': number;
    '50%': number;
    '75%': number;
    max: number;
  };
  filtered_stocks?: Stock[];
  filter_type?: VolumeFilterType;
}

export interface VolumeResponse {
  data: VolumeStatistics;
}

// StockResponse를 확장하여 request 정보를 포함
export interface StockResponse extends BaseStockResponse {
  request: StockRequest;
}

export interface Step3Data {
  analysis: any;
  candidates: StockCandidatesResponse | null;
  appliedStrategy: 'high_return' | 'risk_averse' | 'stable' | null;
  activeTab: 'annual_return' | 'market_cap';
  selectedStrategy: 'high_return' | 'risk_averse' | 'stable' | null;
  endDate: string | null;
}

export interface Step4Data {
  selectedCount: number | null;
  financialData: {
    data: {
      corp_name: string;
      data: {
        category: string;
        subject: string;
        find: string;
        quarters: {
          [key: string]: number;
        };
      }[];
    }[];
  } | null;
  selectedCompany: string | null;
}

export interface Step5Data {
  financialRatios?: any[] | null;
  investmentAnalysis?: any | null;
}

export interface Step6Data {
  testData?: any[] | null;
  backtestResult?: BackTestResult | null;
}

export interface AnalysisState {
  step1Data: StockResponse | null;
  step2Data: VolumeStatistics | null;
  step3Data: Step3Data | null;
  step4Data: any | null;
  step5Data: Step5Data | null;
  step6Data: Step6Data | null;
  step7Data: any | null;
}

export type AnalysisAction = 
  | { type: 'SET_STEP1_DATA'; payload: StockResponse }
  | { type: 'SET_STEP2_DATA'; payload: VolumeStatistics }
  | { type: 'SET_STEP3_DATA'; payload: Step3Data }
  | { type: 'SET_STEP4_DATA'; payload: any }
  | { type: 'SET_STEP5_DATA'; payload: Step5Data }
  | { type: 'SET_STEP6_DATA'; payload: Step6Data }
  | { type: 'SET_STEP7_DATA'; payload: any }
  | { type: 'RESET_ALL' }; 