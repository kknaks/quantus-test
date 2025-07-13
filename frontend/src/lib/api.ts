import { Stock, StockRequest, VolumeFilterType, ScreeningCriteria, BackTestResult } from '@/types/stock';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';

export async function fetchStocks(params: StockRequest) {
  const response = await fetch(`${API_BASE_URL}/collect/stocks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: '데이터를 가져오는데 실패했습니다.' }));
    throw new Error(errorData.detail || '데이터를 가져오는데 실패했습니다.');
  }

  return response.json();
}

export async function fetchVolumeStats(data: any) {
  const response = await fetch(`${API_BASE_URL}/filter/volumes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: '거래량 통계를 가져오는데 실패했습니다.' }));
    throw new Error(errorData.detail || '거래량 통계를 가져오는데 실패했습니다.');
  }

  return response.json();
}

export async function applyVolumeFilter(data: Stock[], filterType: VolumeFilterType) {
  try {
    const response = await fetch(`${API_BASE_URL}/filter/volumes/filter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: data,
        filter_type: filterType
      }),
    });

    if (!response.ok) {
      throw new Error('거래량 필터링 중 오류가 발생했습니다.');
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error applying volume filter:', error);
    throw error;
  }
}

export async function analyzeEndDate(endDd: string, data: any) {
  try {
    const response = await fetch(`${API_BASE_URL}/filter/stocks/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endDd,
        data,
      }),
    });

    if (!response.ok) {
      throw new Error('데이터 분석 중 오류가 발생했습니다.');
    }

    return response.json();
  } catch (error) {
    console.error('Error analyzing end date:', error);
    throw error;
  }
}

export async function getCandidates(data: any[], candidatesType: 'ANNUAL_RETURN' | 'MARKET_CAP_CHANGE', strategyType: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/filter/stocks/candidates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data,
        candidates_type: candidatesType,
        strategy_type: strategyType
      }),
    });

    if (!response.ok) {
      throw new Error('후보 종목을 가져오는데 실패했습니다.');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching candidates:', error);
    throw error;
  }
} 

export async function getFinancialStatements(params: {
  data: any[];
  analysis_cnt: number;
  start_date: string;
  end_date: string;
}) {
  try {
    const response = await fetch(`${API_BASE_URL}/financial/statements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error('재무제표 수집에 실패했습니다.');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching financial statements:', error);
    throw error;
  }
} 

export async function generateFinancialRatios(params: {
  start_date: string;
  end_date: string;
  data: any[];
  financial_statements: any[];
}) {
  try {
    const response = await fetch(`${API_BASE_URL}/idx/gen-idx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error('재무비율 생성에 실패했습니다.');
    }

    return await response.json();
  } catch (error) {
    console.error('Error generating financial ratios:', error);
    throw error;
  }
} 

export async function analyzeInvestmentIndices(data: any[]) {
  try {
    const response = await fetch(`${API_BASE_URL}/idx/analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data
      }),
    });

    if (!response.ok) {
      throw new Error('투자 지표 분석에 실패했습니다.');
    }

    return await response.json();
  } catch (error) {
    console.error('Error analyzing investment indices:', error);
    throw error;
  }
} 

export async function generateTestData(params: {
  data: any[];
  start_date: string;
  end_date: string;
  test_case: number;
}) {
  try {
    const response = await fetch(`${API_BASE_URL}/backtest/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error('테스트 데이터 생성에 실패했습니다.');
    }

    const data = await response.json();
    return data;  // 백엔드 응답을 그대로 반환
  } catch (error) {
    console.error('Error generating test data:', error);
    throw error;
  }
} 

export async function runBacktest(params: {
  test_data: any[];
  screening_criteria: ScreeningCriteria;
  top_n: number;
  initial_capital: number;
}): Promise<BackTestResult> {
  try {
    console.log('Sending params to backend:', JSON.stringify(params, null, 2));
    
    const response = await fetch(`${API_BASE_URL}/backtest/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('Backend error details:', errorData);
      throw new Error(
        errorData?.detail || 
        `백테스트 실행에 실패했습니다. Status: ${response.status}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error running backtest:', error);
    throw error;
  }
} 