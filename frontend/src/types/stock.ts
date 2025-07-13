export interface Stock {
    stockCode: string;      // 종목코드
    stockName: string;      // 종목명
    marketType: string;     // 시장구분
    sectorType: string;     // 소속부
    closingPrice: number;   // 종가
    priceChange: number;    // 대비
    fluctuationRate: number;// 등락률
    openingPrice: number;   // 시가
    highPrice: number;      // 고가
    lowPrice: number;      // 저가
    tradingVolume: number;  // 거래량
    tradingValue: number;   // 거래대금
    marketCap: number;      // 시가총액
    listedShares: number;   // 상장주식수
}

export interface StockRequest {
    startDd: string;
    etf_filter?: boolean;
    inverse_filter?: boolean;
    sector_filter?: boolean;
    preferred_filter?: boolean;
    etc_filter?: boolean;
    top_percent?: number;
    bottom_percent?: number;
}

export interface StockResponse {
    data: Stock[];
}

export enum VolumeFilterType {
    IQR = 'IQR',
    PERCENT = 'PERCENT',
    ALL = 'ALL'
}

export interface StockCmpData {
    stockCode: string;
    stockName: string;
    marketType: string;
    sectorType: string;
    start_closingPrice: number;
    end_closingPrice: number;
    annual_return: number;
    start_marketCap: number;
    end_marketCap: number;
    market_cap_change: number;
    start_listedShares: number;
    end_listedShares: number;
}

export interface StockCandidatesResponse {
    data: StockCmpData[];
}

export interface RatioRow {
  corp_name: string;
  type: string;
  [key: string]: string | number;
}

export interface TestDataResponse {
  data: RatioRow[];
}

export interface BackTestResult {
  monthly_returns: number[];
  monthly_portfolios: Record<string, number>[];
  cumulative_returns: number[];
  total_capital: number[];
  initial_capital: number;
  final_capital: number;
  total_return: number;
  rebalancing_dates: string[];
}

export interface BackTestAnalysis {
  result: BackTestResult;
  metrics: {
    avg_monthly_return: number;
    volatility: number;
    best_month: number;
    worst_month: number;
    win_rate: number;
  };
  screening_summary: {
    total_stocks: {
      initial: number;
      passed: number;
    };
    rejection_reasons: Record<string, number>;
  };
}

export interface ScreeningCriteria {
  PER: [number, number];
  PBR: [number, number];
  ROE: [number, number];
  ROA?: [number, number];
  영업이익률?: [number, number];
  부채비율?: [number, number];
} 