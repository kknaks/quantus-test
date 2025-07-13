'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { useAnalysis } from '@/contexts/AnalysisContext';
import { generateFinancialRatios, analyzeInvestmentIndices } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { formatNumber, formatPercent } from '@/lib/utils';
import dynamic from 'next/dynamic';
import { PlotParams } from 'react-plotly.js';

// 차트 컴포넌트를 동적으로 불러오기
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false }) as React.ComponentType<PlotParams>;

interface RatioData {
  corp_name: string;
  type: string;
  [key: string]: any;
}

interface RatioValues {
  PER: number[];
  PBR: number[];
  ROE: number[];
  ROA: number[];
  영업이익률: number[];
  부채비율: number[];
}

interface RatioMap {
  [corp_name: string]: RatioValues;
}

interface InvestmentAnalysis {
  metrics: string[];
  monthly_stats: {
    [metric: string]: {
      original: { [month: string]: number[] };
      cleaned: { [month: string]: number[] };
    };
  };
  investment_zones: {
    [metric: string]: {
      lower_bound: number | null;
      q1: number | null;
      median: number | null;
      mean: number | null;
      q3: number | null;
      upper_bound: number | null;
      data_count: number;
    };
  };
}

export const GenerateIdx: React.FC = () => {
  const { state, dispatch } = useAnalysis();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [financialRatios, setFinancialRatios] = useState<RatioData[] | null>(null);
  const [investmentAnalysis, setInvestmentAnalysis] = useState<InvestmentAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 상태 복원
  useEffect(() => {
    if (state.step5Data) {
      if (state.step5Data.financialRatios) {
        setFinancialRatios(state.step5Data.financialRatios);
      }
      if (state.step5Data.investmentAnalysis) {
        setInvestmentAnalysis(state.step5Data.investmentAnalysis);
      }
    }
  }, [state.step5Data]);

  const handleGenerateRatios = async () => {
    if (!state.step3Data?.candidates?.data || !state.step4Data?.financialData) {
      setError('선택된 종목 또는 재무제표 데이터가 없습니다.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await generateFinancialRatios({
        start_date: state.step1Data!.request.startDd,
        end_date: state.step3Data.endDate!.replace(/-/g, ''),
        data: state.step3Data.candidates.data,
        financial_statements: state.step4Data.financialData.data
      });

      setFinancialRatios(response.data);

      // Context 업데이트
      dispatch({
        type: 'SET_STEP5_DATA',
        payload: {
          financialRatios: response.data,
          investmentAnalysis: investmentAnalysis
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '재무비율 생성 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3 또는 Step 4 데이터가 없는 경우 처리
  if (!state.step3Data?.candidates?.data) {
    return (
      <div className="p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-yellow-700">먼저 Step 3에서 후보 종목을 선택해주세요.</div>
        </div>
      </div>
    );
  }

  if (!state.step4Data?.financialData) {
    return (
      <div className="p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-yellow-700">먼저 Step 4에서 재무제표를 수집해주세요.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">


      <Card>
        <CardHeader>
          <CardTitle>투자 지표 생성</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 왼쪽: 정보 표시 */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-500 w-32">선택된 종목 수:</span>
                  <span className="text-lg font-semibold">{state.step3Data.candidates.data.length}개</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-500 w-32">재무제표 수집 기업 수:</span>
                  <span className="text-lg font-semibold">{state.step4Data.financialData.data.length}개</span>
                </div>
              </div>

              {/* 오른쪽: 실행 버튼 */}
              <div className="flex items-end justify-end">
                <Button
                  onClick={handleGenerateRatios}
                  disabled={isLoading}
                >
                  {isLoading ? '생성 중...' : '재무비율 생성'}
                </Button>
              </div>
            </div>

            {error && (
              <div className="text-red-500 text-sm mt-2">
                {error}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 재무비율 결과 테이블 */}
      {financialRatios && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>투자지표</CardTitle>
            <Button
              onClick={async () => {
                setIsAnalyzing(true);
                try {
                  const analysis = await analyzeInvestmentIndices(financialRatios);
                  setInvestmentAnalysis(analysis);
                  // Context에 분석 결과 저장
                  dispatch({
                    type: 'SET_STEP5_DATA',
                    payload: {
                      investmentAnalysis: analysis,
                      financialRatios: financialRatios
                    }
                  });
                } catch (err) {
                  setError(err instanceof Error ? err.message : '투자 지표 분석 중 오류가 발생했습니다.');
                } finally {
                  setIsAnalyzing(false);
                }
              }}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? '분석 중...' : '투자 지표 분석'}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>기업명</TableHead>
                    <TableHead className="text-right">PER</TableHead>
                    <TableHead className="text-right">PBR</TableHead>
                    <TableHead className="text-right">ROE</TableHead>
                    <TableHead className="text-right">ROA</TableHead>
                    <TableHead className="text-right">영업이익률</TableHead>
                    <TableHead className="text-right">부채비율</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(financialRatios.reduce((acc: RatioMap, ratio: RatioData) => {
                    if (!acc[ratio.corp_name]) {
                      acc[ratio.corp_name] = {
                        PER: [],
                        PBR: [],
                        ROE: [],
                        ROA: [],
                        영업이익률: [],
                        부채비율: []
                      };
                    }

                    if (ratio.type !== 'closingPrice') {
                      const values = Object.entries(ratio)
                        .filter(([key]) => !isNaN(Number(key)))
                        .map(([, value]) => value as number)
                        .filter(value => value !== null);
                      acc[ratio.corp_name][ratio.type as keyof RatioValues] = values;
                    }

                    return acc;
                  }, {})).map(([corpName, ratios]) => (
                    <TableRow key={corpName}>
                      <TableCell>{corpName}</TableCell>
                      <TableCell className="text-right">
                        {ratios.PER.length > 0 ? formatNumber(ratios.PER.reduce((a, b) => a + b, 0) / ratios.PER.length) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {ratios.PBR.length > 0 ? formatNumber(ratios.PBR.reduce((a, b) => a + b, 0) / ratios.PBR.length) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {ratios.ROE.length > 0 ? formatPercent(ratios.ROE.reduce((a, b) => a + b, 0) / ratios.ROE.length) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {ratios.ROA.length > 0 ? formatPercent(ratios.ROA.reduce((a, b) => a + b, 0) / ratios.ROA.length) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {ratios.영업이익률.length > 0 ? formatPercent(ratios.영업이익률.reduce((a, b) => a + b, 0) / ratios.영업이익률.length) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {ratios.부채비율.length > 0 ? formatPercent(ratios.부채비율.reduce((a, b) => a + b, 0) / ratios.부채비율.length) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 투자 지표 분석 결과 */}
      {investmentAnalysis && (
        <>
          {/* 박스플롯 */}
          <Card>
            <CardHeader>
              <CardTitle>월별 지표 분포</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-8">
                {investmentAnalysis.metrics.map((metric) => {
                  const monthlyData = investmentAnalysis.monthly_stats[metric];
                  const months = Object.keys(monthlyData.original).sort();
                  const zone = investmentAnalysis.investment_zones[metric];
                  const formatValue = metric.includes('율') ? formatPercent : formatNumber;

                  // 날짜 형식 변환 함수
                  const formatDate = (date: string) => {
                    // 8자리(YYYYMMDD) 형식이면 6자리(YYYYMM)로 변환
                    const yyyymm = date.length === 8 ? date.substring(0, 6) : date;
                    const year = yyyymm.substring(2, 4);
                    const month = yyyymm.substring(4, 6);
                    return `${year}.${month}`;
                  };

                  return (
                    <div key={metric} className="space-y-2">
                      <h3 className="text-lg font-semibold text-center">{metric} 분포 (데이터 수: {zone.data_count}개)</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {/* 전체 데이터 박스플롯 */}
                        <div className="h-[300px]">
                          {(() => {
                            // 전체 데이터의 y축 범위 계산
                            const originalValues = months.map(month => monthlyData.original[month]).flat();
                            const originalYMin = Math.min(...originalValues);
                            const originalYMax = Math.max(...originalValues);
                            const originalYRange = originalYMax - originalYMin;

                            return (
                              <Plot
                                data={[{
                                  type: 'box',
                                  y: originalValues,
                                  x: months.map(month => {
                                    const formattedMonth = formatDate(month);
                                    return Array(monthlyData.original[month].length).fill(formattedMonth);
                                  }).flat(),
                                  name: '전체',
                                  boxpoints: 'outliers',
                                  marker: { color: '#90CAF9' },
                                  boxmean: true,
                                  hovertemplate: `
                                    <b>%{x}</b><br>
                                    최대값: %{upperbound}<br>
                                    Q3: %{q3}<br>
                                    중앙값: %{median}<br>
                                    Q1: %{q1}<br>
                                    최소값: %{lowerbound}<br>
                                    <extra></extra>
                                  `
                                }]}
                                layout={{
                                  showlegend: false,
                                  height: 300,
                                  margin: { t: 30, r: 20, b: 40, l: 60 },
                                  yaxis: {
                                    title: metric,
                                    tickformat: metric.includes('율') ? ',.1%' : ',.2f',
                                    range: [originalYMin - originalYRange * 0.1, originalYMax + originalYRange * 0.1],
                                    zeroline: true,
                                    showgrid: true
                                  },
                                  xaxis: {
                                    title: '월',
                                    showgrid: false,
                                    tickangle: 0
                                  },
                                  title: { text: '전체 데이터', font: { size: 14 } }
                                }}
                                config={{ displayModeBar: false, responsive: true }}
                                style={{ width: '100%', height: '100%' }}
                              />
                            );
                          })()}
                        </div>

                        {/* 이상치 제거 데이터 박스플롯 */}
                        <div className="h-[300px]">
                          {(() => {
                            // 이상치 제거 데이터의 y축 범위 계산
                            const cleanedValues = months.map(month => monthlyData.cleaned[month]).flat();
                            const cleanedYMin = Math.min(...cleanedValues);
                            const cleanedYMax = Math.max(...cleanedValues);
                            const cleanedYRange = cleanedYMax - cleanedYMin;

                            return (
                              <Plot
                                data={[{
                                  type: 'box',
                                  y: cleanedValues,
                                  x: months.map(month => {
                                    const formattedMonth = formatDate(month);
                                    return Array(monthlyData.cleaned[month].length).fill(formattedMonth);
                                  }).flat(),
                                  name: '이상치 제거',
                                  boxpoints: 'outliers',
                                  marker: { color: '#4CAF50' },
                                  boxmean: true,
                                  hovertemplate: `
                                    <b>%{x}</b><br>
                                    최대값: %{upperbound}<br>
                                    Q3: %{q3}<br>
                                    중앙값: %{median}<br>
                                    Q1: %{q1}<br>
                                    최소값: %{lowerbound}<br>
                                    <extra></extra>
                                  `
                                }]}
                                layout={{
                                  showlegend: false,
                                  height: 300,
                                  margin: { t: 30, r: 20, b: 40, l: 60 },
                                  yaxis: {
                                    title: metric,
                                    tickformat: metric.includes('율') ? ',.1%' : ',.2f',
                                    range: [cleanedYMin - cleanedYRange * 0.1, cleanedYMax + cleanedYRange * 0.1],
                                    zeroline: true,
                                    showgrid: true
                                  },
                                  xaxis: {
                                    title: '월',
                                    showgrid: false,
                                    tickangle: 0
                                  },
                                  title: { text: '이상치 제거', font: { size: 14 } }
                                }}
                                config={{ displayModeBar: false, responsive: true }}
                                style={{ width: '100%', height: '100%' }}
                              />
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 투자 구간 분석 */}
          <Card>
            <CardHeader>
              <CardTitle>투자 구간 분석</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>지표</TableHead>
                    <TableHead className="text-right">~Q1</TableHead>
                    <TableHead className="text-right">Q1~중앙값</TableHead>
                    <TableHead className="text-right">중앙값</TableHead>
                    <TableHead className="text-right">중앙값~Q3</TableHead>
                    <TableHead className="text-right">Q3~</TableHead>
                    <TableHead className="text-right">데이터 수</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investmentAnalysis.metrics.map((metric) => {
                    const zone = investmentAnalysis.investment_zones[metric];
                    const formatValue = metric.includes('율') ? formatPercent : formatNumber;

                    return (
                      <TableRow key={metric}>
                        <TableCell>{metric}</TableCell>
                        <TableCell className="text-right">{zone.lower_bound !== null ? formatValue(zone.lower_bound) : '-'}</TableCell>
                        <TableCell className="text-right">{zone.q1 !== null ? formatValue(zone.q1) : '-'}</TableCell>
                        <TableCell className="text-right">{zone.median !== null ? formatValue(zone.median) : '-'}</TableCell>
                        <TableCell className="text-right">{zone.q3 !== null ? formatValue(zone.q3) : '-'}</TableCell>
                        <TableCell className="text-right">{zone.upper_bound !== null ? formatValue(zone.upper_bound) : '-'}</TableCell>
                        <TableCell className="text-right">{zone.data_count}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};