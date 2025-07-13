'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { useAnalysis } from '@/contexts/AnalysisContext';
import { generateTestData, runBacktest } from '@/lib/api';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { formatNumber, formatPercent } from '@/lib/utils';
import { BackTestAnalysis, TestDataResponse, BackTestResult } from '@/types/stock';

type Metric = 'PER' | 'PBR' | 'ROE' | 'ROA' | '영업이익률' | '부채비율';

export function Backtest() {
  const { state, dispatch } = useAnalysis();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<'testData' | 'backtest' | null>(null);
  const [testData, setTestData] = useState<any[] | null>(null);
  const [testCase, setTestCase] = useState<number>(10);
  const [portfolioSize, setPortfolioSize] = useState<number>(5);
  const [error, setError] = useState<string | null>(null);
  const [backtestResult, setBacktestResult] = useState<BackTestResult | null>(null);

  // 상태 복원
  useEffect(() => {
    if (state.step6Data) {
      // step6Data가 새로운 구조인지 확인
      if (state.step6Data.testData) {
        setTestData(state.step6Data.testData);
      }
      if (state.step6Data.backtestResult) {
        setBacktestResult(state.step6Data.backtestResult);
      }
    }
  }, [state.step6Data]);

  const handleGenerateTestData = async () => {
    if (!state.step5Data?.financialRatios || !state.step1Data?.data) return;

    try {
      setIsLoading(true);
      setLoadingType('testData');
      setError(null);
      const stockData = state.step1Data.data.map(stock => ({
        stockCode: stock.stockCode,
        stockName: stock.stockName,
        marketType: stock.marketType,
        sectorType: stock.sectorType,
        closingPrice: stock.closingPrice,
        priceChange: stock.priceChange,
        fluctuationRate: stock.fluctuationRate,
        openingPrice: stock.openingPrice,
        highPrice: stock.highPrice,
        lowPrice: stock.lowPrice,
        tradingVolume: stock.tradingVolume,
        tradingValue: stock.tradingValue,
        marketCap: stock.marketCap,
        listedShares: stock.listedShares
      }));

      const startYear = state.step1Data.request.startDd.substring(0, 4);
      const endYear = startYear === "2023" ? "2023" : "2024";
      const startDate = `${startYear}0101`;
      const endDate = `${endYear}1231`;

      const response = await generateTestData({
        data: stockData,
        start_date: startDate,
        end_date: endDate,
        test_case: testCase
      });

      console.log('생성된 테스트 데이터:', response);

      // 데이터 변환 - corp_name과 type 정보 유지
      const transformedData = response.data.map((ratio: { corp_name: string; type: string;[key: string]: any }) => {
        const { corp_name, type, ...dateValues } = ratio;
        const dateEntries = Object.entries(dateValues)
          .filter(([key]) => !isNaN(Number(key)))
          .reduce((acc, [date, value]) => {
            if (typeof value === 'number') {
              acc[date] = value;
            }
            return acc;
          }, {} as { [key: string]: number });

        return {
          corp_name,
          type,
          ...dateEntries
        };
      });

      setTestData(transformedData);
      dispatch({
        type: 'SET_STEP6_DATA',
        payload: { testData: transformedData, backtestResult: backtestResult }
      });
    } catch (error) {
      console.error('테스트 데이터 생성 중 오류 발생:', error);
      setError('테스트 데이터 생성 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      setLoadingType(null);
    }
  };

  const handleTestCaseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0 && value <= 50) {
      setTestCase(value);
      if (portfolioSize > value) {
        setPortfolioSize(value);
      }
    }
  };

  const handlePortfolioSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0 && value <= testCase) {
      setPortfolioSize(value);
    }
  };

  const handleRunBacktest = async () => {
    if (!testData) {
      setError('먼저 테스트 데이터를 생성해주세요.');
      return;
    }
    if (portfolioSize > testCase) {
      setError('포트폴리오 크기는 테스트 케이스 수보다 작아야 합니다.');
      return;
    }

    try {
      setIsLoading(true);
      setLoadingType('backtest');
      setError(null);

      console.log('Sending test data:', JSON.stringify(testData, null, 2));

      // 백엔드 응답 형식을 그대로 사용
      const response = await runBacktest({
        test_data: testData,
        screening_criteria: {
          PER: [state.step5Data?.investmentAnalysis?.investment_zones.PER.lower_bound || 0, state.step5Data?.investmentAnalysis?.investment_zones.PER.mean || 0],
          PBR: [state.step5Data?.investmentAnalysis?.investment_zones.PBR.lower_bound || null, state.step5Data?.investmentAnalysis?.investment_zones.PBR.mean || null],
          ROE: [state.step5Data?.investmentAnalysis?.investment_zones.ROE.median || null, state.step5Data?.investmentAnalysis?.investment_zones.ROE.upper_bound || null],
          ROA: [state.step5Data?.investmentAnalysis?.investment_zones.ROA.median || null, state.step5Data?.investmentAnalysis?.investment_zones.ROA.upper_bound || null],
          영업이익률: [state.step5Data?.investmentAnalysis?.investment_zones.영업이익률.median || null, state.step5Data?.investmentAnalysis?.investment_zones.영업이익률.upper_bound || null],
          // 부채비율: [state.step5Data?.investmentAnalysis?.investment_zones.부채비율.lower_bound || null, state.step5Data?.investmentAnalysis?.investment_zones.부채비율.q1 || null]
          부채비율: [0, state.step5Data?.investmentAnalysis?.investment_zones.부채비율.q3 || null]

          // // PER: 현실적인 범위 (0 ~ 50)
          // PER: [0, 50],
          // // PBR: 현실적인 범위 (0 ~ 3)
          // PBR: [0, 3],
          // // ROE: 손실 기업도 포함 (-50% ~ 100%)
          // ROE: [-50, 100],
          // // ROA: 손실 기업도 포함 (-50% ~ 100%)
          // ROA: [-50, 100],
          // // 영업이익률: 손실 기업도 포함 (-50% ~ 100%)
          // 영업이익률: [-50, 100],
          // // 부채비율: 현실적인 범위 (0 ~ 200%)
          // 부채비율: [0, 200]
        },
        top_n: portfolioSize,
        initial_capital: 10000000
      });

      setBacktestResult(response);
      dispatch({
        type: 'SET_STEP6_DATA',
        payload: { testData: testData, backtestResult: response }
      });
    } catch (error: any) {
      console.error('백테스트 실행 중 오류 발생:', error);
      // 에러 응답의 자세한 내용 출력
      if (error.response) {
        console.error('Error response:', {
          status: error.response.status,
          data: error.response.data,
          headers: error.response.headers
        });
      }
      setError('백테스트 실행 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      setLoadingType(null);
    }
  };

  if (!state.step5Data?.financialRatios || !state.step1Data?.data) {
    return (
      <div className="p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-yellow-700">
            {!state.step5Data?.financialRatios
              ? '먼저 Step 5에서 투자 지표를 생성해주세요.'
              : '주식 데이터가 없습니다.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 로딩 모달 */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-sm mx-auto">
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
              <p className="text-lg font-medium">
                {loadingType === 'testData' ? '테스트 데이터 생성 중...' : '백테스트 실행 중...'}
              </p>
              <p className="text-sm text-gray-500 text-center">
                {loadingType === 'testData' ? (
                  <>
                    {testCase}개 종목의 테스트 데이터를 생성하고 있습니다.<br />
                    잠시만 기다려주세요.
                  </>
                ) : (
                  <>
                    {portfolioSize}개 종목으로 백테스트를 진행하고 있습니다.<br />
                    잠시만 기다려주세요.
                  </>
                )}
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* 스크리닝 기준 카드 */}
      {state.step5Data?.investmentAnalysis && (
        <Card>
          <CardHeader>
            <CardTitle>스크리닝 기준</CardTitle>
            <CardDescription>
              각 지표별 투자 구간을 기준으로 종목을 선별합니다.
              PER, PBR, 부채비율은 낮을수록 좋고, ROE, ROA, 영업이익률은 높을수록 좋습니다.
            </CardDescription>
            <div className="flex items-center gap-4 mt-3 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-100 border border-blue-200 rounded"></div>
                <span className="text-gray-600">스크리닝 범위 경계</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-50 border border-blue-100 rounded"></div>
                <span className="text-gray-600">스크리닝 범위 내</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>지표</TableHead>
                  <TableHead className="text-right">~Q1</TableHead>
                  <TableHead className="text-right">Q1~중앙값</TableHead>
                  <TableHead className="text-right">중앙값</TableHead>
                  <TableHead className="text-right">평균</TableHead>
                  <TableHead className="text-right">중앙값~Q3</TableHead>
                  <TableHead className="text-right">Q3~</TableHead>
                  <TableHead className="text-right">데이터 수</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.step5Data.investmentAnalysis.metrics.map((metric: Metric) => {
                  const zone = state.step5Data!.investmentAnalysis!.investment_zones[metric];
                  const formatValue = metric.includes('율') ? formatPercent : formatNumber;

                  // 스크리닝 기준 범위 확인
                  const getScreeningRange = (metric: Metric) => {
                    switch (metric) {
                      case 'PER':
                        return { start: 'lower_bound', end: 'mean' };
                      case 'PBR':
                        return { start: 'lower_bound', end: 'mean' };
                      case 'ROE':
                        return { start: 'median', end: 'upper_bound' };
                      case 'ROA':
                        return { start: 'median', end: 'upper_bound' };
                      case '영업이익률':
                        return { start: 'median', end: 'upper_bound' };
                      case '부채비율':
                        return { start: 'lower_bound', end: 'q3' };
                      default:
                        return { start: null, end: null };
                    }
                  };

                  const screeningRange = getScreeningRange(metric);

                  // 각 셀의 배경색 결정
                  const getCellBgClass = (position: string) => {
                    if (screeningRange.start && screeningRange.end) {
                      if (position === screeningRange.start || position === screeningRange.end) {
                        return 'bg-blue-100 border-blue-200';
                      }

                      // 범위 안에 있는 중간 값들 체크
                      const positions = ['lower_bound', 'q1', 'median', 'mean', 'q3', 'upper_bound'];
                      const startIdx = positions.indexOf(screeningRange.start);
                      const endIdx = positions.indexOf(screeningRange.end);
                      const currentIdx = positions.indexOf(position);

                      if (currentIdx > startIdx && currentIdx < endIdx) {
                        return 'bg-blue-50 border-blue-100';
                      }
                    }
                    return '';
                  };

                  return (
                    <TableRow key={metric}>
                      <TableCell className="font-medium">{metric}</TableCell>
                      <TableCell className={`text-right ${getCellBgClass('lower_bound')}`}>
                        {zone.lower_bound !== null ? formatValue(zone.lower_bound) : '-'}
                      </TableCell>
                      <TableCell className={`text-right ${getCellBgClass('q1')}`}>
                        {zone.q1 !== null ? formatValue(zone.q1) : '-'}
                      </TableCell>
                      <TableCell className={`text-right ${getCellBgClass('median')}`}>
                        {zone.median !== null ? formatValue(zone.median) : '-'}
                      </TableCell>
                      <TableCell className={`text-right ${getCellBgClass('mean')}`}>
                        {zone.mean !== null ? formatValue(zone.mean) : '-'}
                      </TableCell>
                      <TableCell className={`text-right ${getCellBgClass('q3')}`}>
                        {zone.q3 !== null ? formatValue(zone.q3) : '-'}
                      </TableCell>
                      <TableCell className={`text-right ${getCellBgClass('upper_bound')}`}>
                        {zone.upper_bound !== null ? formatValue(zone.upper_bound) : '-'}
                      </TableCell>
                      <TableCell className="text-right">{zone.data_count}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 백테스트 설정 카드 */}
      <Card>
        <CardHeader>
          <CardTitle>백테스트</CardTitle>
          <CardDescription>
            테스트 기간: {state.step1Data.request.startDd.substring(0, 4)}년 1월 1일 ~ 12월 31일 · 전체 종목 수: {state.step1Data.data.length}개
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-8">
              {/* 왼쪽: 테스트 케이스 생성 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">테스트 케이스 생성</h3>
                <div className="space-y-4">
                  <Label htmlFor="testCase">생성할 후보 종목 수</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="testCase"
                      type="number"
                      min={1}
                      max={50}
                      value={testCase}
                      onChange={handleTestCaseChange}
                      className="w-24"
                      placeholder="1-50"
                    />
                    <span className="text-sm text-gray-500">개</span>
                    <Button
                      onClick={handleGenerateTestData}
                      disabled={isLoading}
                      size="sm"
                      className="ml-2"
                    >
                      {isLoading ? '생성 중...' : '테스트 데이터 생성'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* 오른쪽: 백테스트 실행 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">백테스트 실행</h3>
                <div className="space-y-4">
                  <Label htmlFor="portfolioSize">테스트할 종목 수</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="portfolioSize"
                      type="number"
                      min={1}
                      max={testCase}
                      value={portfolioSize}
                      onChange={handlePortfolioSizeChange}
                      className="w-24"
                      placeholder={`1-${testCase}`}
                      disabled={!testData}
                    />
                    <span className="text-sm text-gray-500">개</span>
                    <Button
                      onClick={handleRunBacktest}
                      disabled={isLoading || !testData}
                      size="sm"
                      className="ml-2"
                    >
                      {isLoading ? '실행 중...' : '백테스트 실행'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {backtestResult && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">백테스트 결과 요약</h3>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  {/* 기본 정보 */}
                  <div className="rounded-lg border bg-card p-4">
                    <h4 className="font-medium mb-3">기본 정보</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">초기 자본금:</span>
                        <span className="font-medium">{formatNumber(backtestResult.initial_capital)}원</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">최종 자본금:</span>
                        <span className="font-medium">{formatNumber(backtestResult.final_capital)}원</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">리밸런싱 횟수:</span>
                        <span className="font-medium">{backtestResult.rebalancing_dates?.length || 0}회</span>
                      </div>
                    </div>
                  </div>

                  {/* 수익률 정보 */}
                  <div className="rounded-lg border bg-card p-4">
                    <h4 className="font-medium mb-3">수익률 정보</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">총 수익률:</span>
                        <span className={`font-medium ${backtestResult.total_return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {backtestResult.total_return?.toFixed(2) || '0.00'}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">평균 월간수익률:</span>
                        <span className="font-medium">
                          {backtestResult.monthly_returns?.length > 0
                            ? (backtestResult.monthly_returns.reduce((a: number, b: number) => a + b, 0) / backtestResult.monthly_returns.length).toFixed(2)
                            : '0.00'}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">최고 월간수익률:</span>
                        <span className="font-medium text-green-600">
                          {backtestResult.monthly_returns?.length > 0
                            ? Math.max(...backtestResult.monthly_returns).toFixed(2)
                            : '0.00'}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">최저 월간수익률:</span>
                        <span className="font-medium text-red-600">
                          {backtestResult.monthly_returns?.length > 0
                            ? Math.min(...backtestResult.monthly_returns).toFixed(2)
                            : '0.00'}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border bg-blue-50 p-4">
                  <p className="text-sm text-blue-700">
                    💡 상세한 결과와 차트는 다음 단계에서 확인할 수 있습니다.
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
