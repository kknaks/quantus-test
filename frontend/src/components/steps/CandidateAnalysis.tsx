'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useAnalysis } from '@/contexts/AnalysisContext';
import { analyzeEndDate, getCandidates } from '@/lib/api';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, ComposedChart, Bar, Line, ReferenceArea, Cell } from 'recharts';
import { formatNumber, formatPercent, formatCurrency } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { StockCmpData } from '@/types/stock';

type AnalysisTab = 'annual_return' | 'market_cap';

type StrategyType = 'high_return' | 'risk_averse' | 'stable' | null;

type SortConfig = {
  key: keyof StockCmpData | null;
  direction: 'asc' | 'desc';
};

export function CandidateAnalysis() {
  const { state, dispatch } = useAnalysis();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AnalysisTab>('annual_return');
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType>(null);
  const [appliedStrategy, setAppliedStrategy] = useState<StrategyType>(null);
  const [candidateStocks, setCandidateStocks] = useState<StockCmpData[] | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'desc' });

  // 상태 복원
  useEffect(() => {
    if (state.step3Data) {
      setAnalysisResult(state.step3Data.analysis);
      if (state.step3Data.candidates) {
        setCandidateStocks(state.step3Data.candidates.data);
        setAppliedStrategy(state.step3Data.appliedStrategy || null);
      }
      if (state.step3Data.activeTab) {
        setActiveTab(state.step3Data.activeTab);
      }
      if (state.step3Data.selectedStrategy !== undefined) {
        setSelectedStrategy(state.step3Data.selectedStrategy);
      }
      if (state.step3Data.endDate) {
        // endDate는 이미 시작 날짜와 동일하게 설정되므로 여기서는 사용하지 않음
      }
    }
  }, [state.step3Data]);

  const handleSort = (key: keyof StockCmpData) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortedData = () => {
    if (!candidateStocks || !sortConfig.key) return candidateStocks;

    return [...candidateStocks].sort((a, b) => {
      const aValue = a[sortConfig.key!];
      const bValue = b[sortConfig.key!];

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      return 0;
    });
  };

  const handleStrategySelect = async (strategy: StrategyType) => {
    setSelectedStrategy(strategy);
    // 전략이 변경될 때마다 context 업데이트
    if (state.step3Data) {
      dispatch({
        type: 'SET_STEP3_DATA',
        payload: {
          ...state.step3Data,
          selectedStrategy: strategy,
          endDate: state.step3Data.endDate // 시작 날짜와 동일하게 유지
        }
      });
    }
  };

  const handleTabChange = (tab: AnalysisTab) => {
    setActiveTab(tab);
    // 탭이 변경될 때마다 context 업데이트
    if (state.step3Data) {
      dispatch({
        type: 'SET_STEP3_DATA',
        payload: {
          ...state.step3Data,
          activeTab: tab,
          endDate: state.step3Data.endDate // 시작 날짜와 동일하게 유지
        }
      });
    }
  };

  const sortedData = getSortedData();

  const getStrategyRange = (stats: any, strategy: StrategyType) => {
    let x1: number, x2: number;
    let color: string = '';

    switch (strategy) {
      case 'high_return':
        x1 = stats['75%'];
        x2 = stats.max;
        color = 'rgb(255, 99, 132)';
        break;
      case 'risk_averse':
        x1 = stats.min;
        x2 = stats['25%'];
        color = 'rgb(54, 162, 235)';
        break;
      case 'stable':
        x1 = stats['25%'];
        x2 = stats['75%'];
        color = 'rgb(75, 192, 192)';
        break;
      default:
        x1 = 0;
        x2 = 0;
        color = 'transparent';
    }

    return { x1, x2, color };
  };

  // Step 1 또는 Step 2 데이터가 없는 경우 처리
  if (!state.step1Data) {
    return (
      <div className="p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-yellow-700">먼저 Step 1에서 주식 데이터를 수집해주세요.</div>
        </div>
      </div>
    );
  }

  if (!state.step2Data?.filtered_stocks) {
    return (
      <div className="p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-yellow-700">먼저 Step 2에서 거래량 필터링을 진행해주세요.</div>
        </div>
      </div>
    );
  }

  // 시작 년도와 날짜 설정
  const startYear = state.step1Data.request.startDd.substring(0, 4);
  const startDate = state.step1Data.request.startDd;
  const endDate = `${startYear}1231`;  // YYYYMMDD 형식으로 맞춤

  const handleAnalyze = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // endDate는 이미 YYYYMMDD 형식이므로 추가 변환 불필요
      const result = await analyzeEndDate(endDate, state.step2Data!.filtered_stocks);
      setAnalysisResult(result);
      dispatch({
        type: 'SET_STEP3_DATA', payload: {
          analysis: result,
          candidates: state.step3Data?.candidates || null,
          appliedStrategy: state.step3Data?.appliedStrategy || null,
          activeTab: state.step3Data?.activeTab || 'annual_return',
          selectedStrategy: state.step3Data?.selectedStrategy || null,
          endDate: endDate
        }
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // startDate는 step1Data의 request에서 가져옵니다
  // const startDate = state.step1Data.request.startDd.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');

  const generateHistogramData = (data: any) => {
    if (!data?.histogram) return { histogram: [], curve: [] };

    const { counts, bin_edges, normal_curve } = data.histogram;

    // 히스토그램 데이터
    const histData = counts.map((count: number, i: number) => ({
      value: (bin_edges[i] + bin_edges[i + 1]) / 2,  // 구간의 중앙값
      start: bin_edges[i],    // 구간 시작
      end: bin_edges[i + 1],  // 구간 끝
      frequency: count
    }));

    // 정규분포 곡선 데이터
    const curveData = normal_curve.x.map((x: number, i: number) => ({
      value: x,
      normal: normal_curve.y[i]
    }));

    return {
      histogram: histData,
      curve: curveData
    };
  };

  const renderAnalysisStats = (data: any, title: string) => {
    if (!data?.stats) return null;
    const stats = data.stats;

    return (
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div>
          <h4 className="text-sm text-gray-500">평균</h4>
          <p className="text-lg font-medium">{formatPercent(stats.mean)}</p>
        </div>
        <div>
          <h4 className="text-sm text-gray-500">중앙값</h4>
          <p className="text-lg font-medium">{formatPercent(stats['50%'])}</p>
        </div>
        <div>
          <h4 className="text-sm text-gray-500">표준편차</h4>
          <p className="text-lg font-medium">{formatPercent(stats.std)}</p>
        </div>
        <div>
          <h4 className="text-sm text-gray-500">데이터 수</h4>
          <p className="text-lg font-medium">{Math.round(stats.count).toLocaleString()}</p>
        </div>
        <div>
          <h4 className="text-sm text-gray-500">최소값</h4>
          <p className="text-lg font-medium">{formatPercent(stats.min)}</p>
        </div>
        <div>
          <h4 className="text-sm text-gray-500">25% 백분위</h4>
          <p className="text-lg font-medium">{formatPercent(stats['25%'])}</p>
        </div>
        <div>
          <h4 className="text-sm text-gray-500">75% 백분위</h4>
          <p className="text-lg font-medium">{formatPercent(stats['75%'])}</p>
        </div>
        <div>
          <h4 className="text-sm text-gray-500">최대값</h4>
          <p className="text-lg font-medium">{formatPercent(stats.max)}</p>
        </div>
      </div>
    );
  };

  const renderStrategyOverlay = (data: any) => {
    if (!data?.stats || !selectedStrategy) return null;

    const stats = data.stats;
    let x1: number, x2: number;
    let label: string = '';
    let color: string = '';

    switch (selectedStrategy) {
      case 'high_return':
        x1 = stats['75%'];
        x2 = stats.max;
        label = '고수익성 전략 (>75%)';
        color = 'rgba(255, 99, 132,1)';
        break;
      case 'risk_averse':
        x1 = stats.min;
        x2 = stats['25%'];
        label = '위험회피 전략 (<25%)';
        color = 'rgba(54, 162, 235,1)';
        break;
      case 'stable':
        x1 = stats['25%'];
        x2 = stats['75%'];
        label = '안정성 전략 (25%~75%)';
        color = 'rgba(75, 192, 192,1)';
        break;
      default:
        return null;
    }

    // 히스토그램 데이터에서 최대 빈도 찾기
    const histogramData = generateHistogramData(data).histogram;
    const maxFrequency = Math.max(...histogramData.map((d: { frequency: number }) => d.frequency));

    return (
      <ReferenceArea
        x1={x1}
        x2={x2}
        y1={0}
        y2={maxFrequency}
        fill={color}
        fillOpacity={0.2}
        stroke={color}
        strokeOpacity={1}
        strokeWidth={1}
        label={{
          value: label,
          position: 'insideTop',
          fill: color.replace(', 0.8)', ', 1)'),
          fontSize: 12,
          fontWeight: 'bold'
        }}
        ifOverflow="visible"
      />
    );
  };

  const renderStrategyButtons = () => (
    <div className="flex space-x-2 mb-4">
      <Button
        variant={selectedStrategy === 'high_return' ? 'default' : 'outline'}
        onClick={() => handleStrategySelect('high_return')}
        size="sm"
      >
        고수익성 전략
      </Button>
      <Button
        variant={selectedStrategy === 'risk_averse' ? 'default' : 'outline'}
        onClick={() => handleStrategySelect('risk_averse')}
        size="sm"
      >
        위험회피 전략
      </Button>
      <Button
        variant={selectedStrategy === 'stable' ? 'default' : 'outline'}
        onClick={() => handleStrategySelect('stable')}
        size="sm"
      >
        안정성 전략
      </Button>
      <Button
        variant={selectedStrategy === null ? 'default' : 'outline'}
        onClick={() => handleStrategySelect(null)}
        size="sm"
      >
        오버레이 없음
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>후보 종목 분석</CardTitle>
          <CardDescription>
            분석 기간: {startDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')} ~ {endDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                onClick={handleAnalyze}
                disabled={isLoading}
                className="w-32"
              >
                {isLoading ? '분석 중...' : '분석'}
              </Button>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}

            {analysisResult && (
              <div className="mt-8">
                <div className="flex space-x-2 mb-4">
                  <Button
                    variant={activeTab === 'annual_return' ? 'default' : 'outline'}
                    onClick={() => handleTabChange('annual_return')}
                  >
                    수익률 분포
                  </Button>
                  <Button
                    variant={activeTab === 'market_cap' ? 'default' : 'outline'}
                    onClick={() => handleTabChange('market_cap')}
                  >
                    시가총액 증가율 분포
                  </Button>
                </div>

                {activeTab === 'annual_return' && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4">수익률 분포</h3>
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex space-x-2">
                        <Button
                          variant={selectedStrategy === 'high_return' ? 'default' : 'outline'}
                          onClick={() => handleStrategySelect('high_return')}
                          size="sm"
                        >
                          고수익성 전략
                        </Button>
                        <Button
                          variant={selectedStrategy === 'risk_averse' ? 'default' : 'outline'}
                          onClick={() => handleStrategySelect('risk_averse')}
                          size="sm"
                        >
                          위험회피 전략
                        </Button>
                        <Button
                          variant={selectedStrategy === 'stable' ? 'default' : 'outline'}
                          onClick={() => handleStrategySelect('stable')}
                          size="sm"
                        >
                          안정성 전략
                        </Button>
                        <Button
                          variant={selectedStrategy === null ? 'default' : 'outline'}
                          onClick={() => handleStrategySelect(null)}
                          size="sm"
                        >
                          오버레이 없음
                        </Button>
                      </div>
                      <Button
                        onClick={async () => {
                          if (!selectedStrategy || !analysisResult) {
                            setError('전략을 선택해주세요.');
                            return;
                          }
                          try {
                            setIsLoading(true);
                            const candidates = await getCandidates(
                              analysisResult.data,
                              'ANNUAL_RETURN',
                              selectedStrategy.toUpperCase()
                            );
                            setCandidateStocks(candidates.data);
                            setAppliedStrategy(selectedStrategy);
                            dispatch({
                              type: 'SET_STEP3_DATA', payload: {
                                analysis: analysisResult,
                                candidates: candidates,
                                appliedStrategy: selectedStrategy,
                                activeTab: activeTab,
                                selectedStrategy: selectedStrategy,
                                endDate: endDate
                              }
                            });
                          } catch (err) {
                            setError(err instanceof Error ? err.message : '후보 종목을 가져오는데 실패했습니다.');
                          } finally {
                            setIsLoading(false);
                          }
                        }}
                        disabled={!selectedStrategy || isLoading}
                      >
                        {isLoading ? '조회 중...' : '후보 종목 조회'}
                      </Button>
                    </div>
                    {renderAnalysisStats(analysisResult.annual_return_analysis, '수익률')}
                    <div className="h-[400px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={generateHistogramData(analysisResult.annual_return_analysis).histogram}
                          margin={{ top: 20, right: 20, left: 20, bottom: 60 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="value"
                            tickFormatter={(value) => formatPercent(value)}
                            label={{ value: '수익률', position: 'bottom', offset: 20 }}
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="rounded-lg border bg-background p-2 shadow-sm">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="flex flex-col">
                                        <span className="text-[0.70rem] uppercase text-muted-foreground">
                                          수익률
                                        </span>
                                        <span className="font-bold text-muted-foreground">
                                          {formatPercent(payload[0].payload.value)}
                                        </span>
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-[0.70rem] uppercase text-muted-foreground">
                                          빈도
                                        </span>
                                        <span className="font-bold">
                                          {payload[0].payload.frequency}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar
                            dataKey="frequency"
                            radius={[4, 4, 0, 0]}
                          >
                            {generateHistogramData(analysisResult.annual_return_analysis).histogram.map((entry: { value: number, frequency: number, start: number, end: number }, index: number) => {
                              if (!selectedStrategy || typeof entry.value !== 'number') {
                                return <Cell key={`cell-${index}`} fill="var(--primary)" />;
                              }

                              const stats = analysisResult.annual_return_analysis.stats;
                              let range;
                              let color;

                              switch (selectedStrategy) {
                                case 'high_return':
                                  range = { min: stats['75%'], max: stats.max };
                                  color = (entry.value >= range.min)
                                    ? 'rgba(255, 99, 132, 1)'
                                    : 'rgba(200, 200, 200, 0.3)';
                                  break;
                                case 'risk_averse':
                                  range = { min: stats['25%'], max: stats.max };
                                  color = (entry.value >= range.min)
                                    ? 'rgba(54, 162, 235, 1)'
                                    : 'rgba(200, 200, 200, 0.3)';
                                  break;
                                case 'stable':
                                  range = { min: stats['25%'], max: stats['75%'] };
                                  color = (entry.start <= range.max && entry.end >= range.min)
                                    ? 'rgba(130, 202, 157, 1)'
                                    : 'rgba(200, 200, 200, 0.3)';
                                  break;
                                default:
                                  color = "var(--primary)";
                              }

                              return <Cell key={`cell-${index}`} fill={color} />;
                            })}
                          </Bar>
                          <ReferenceLine
                            x={analysisResult.annual_return_analysis.stats.mean}
                            stroke="var(--primary)"
                            strokeDasharray="3 3"
                            label={{
                              value: '평균',
                              position: 'top',
                              fill: 'var(--primary)',
                              fontSize: 12
                            }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {activeTab === 'market_cap' && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4">시가총액 증가율 분포</h3>
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex space-x-2">
                        <Button
                          variant={selectedStrategy === 'high_return' ? 'default' : 'outline'}
                          onClick={() => handleStrategySelect('high_return')}
                          size="sm"
                        >
                          고수익성 전략
                        </Button>
                        <Button
                          variant={selectedStrategy === 'risk_averse' ? 'default' : 'outline'}
                          onClick={() => handleStrategySelect('risk_averse')}
                          size="sm"
                        >
                          위험회피 전략
                        </Button>
                        <Button
                          variant={selectedStrategy === 'stable' ? 'default' : 'outline'}
                          onClick={() => handleStrategySelect('stable')}
                          size="sm"
                        >
                          안정성 전략
                        </Button>
                        <Button
                          variant={selectedStrategy === null ? 'default' : 'outline'}
                          onClick={() => handleStrategySelect(null)}
                          size="sm"
                        >
                          오버레이 없음
                        </Button>
                      </div>
                      <Button
                        onClick={async () => {
                          if (!selectedStrategy || !analysisResult) {
                            setError('전략을 선택해주세요.');
                            return;
                          }
                          try {
                            setIsLoading(true);
                            const candidates = await getCandidates(
                              analysisResult.data,
                              'MARKET_CAP_CHANGE',
                              selectedStrategy.toUpperCase()
                            );
                            setCandidateStocks(candidates.data);
                            setAppliedStrategy(selectedStrategy);
                            dispatch({
                              type: 'SET_STEP3_DATA', payload: {
                                analysis: analysisResult,
                                candidates: candidates,
                                appliedStrategy: selectedStrategy,
                                activeTab: activeTab,
                                selectedStrategy: selectedStrategy,
                                endDate: endDate
                              }
                            });
                          } catch (err) {
                            setError(err instanceof Error ? err.message : '후보 종목을 가져오는데 실패했습니다.');
                          } finally {
                            setIsLoading(false);
                          }
                        }}
                        disabled={!selectedStrategy || isLoading}
                      >
                        {isLoading ? '조회 중...' : '후보 종목 조회'}
                      </Button>
                    </div>
                    {renderAnalysisStats(analysisResult.market_cap_change_analysis, '시가총액 증가율')}
                    <div className="h-[400px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={generateHistogramData(analysisResult.market_cap_change_analysis).histogram}
                          margin={{ top: 20, right: 20, left: 20, bottom: 60 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="value"
                            tickFormatter={(value) => formatPercent(value)}
                            label={{ value: '시가총액 증가율', position: 'bottom', offset: 20 }}
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="rounded-lg border bg-background p-2 shadow-sm">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="flex flex-col">
                                        <span className="text-[0.70rem] uppercase text-muted-foreground">
                                          시가총액 증가율
                                        </span>
                                        <span className="font-bold text-muted-foreground">
                                          {formatPercent(payload[0].payload.value)}
                                        </span>
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-[0.70rem] uppercase text-muted-foreground">
                                          빈도
                                        </span>
                                        <span className="font-bold">
                                          {payload[0].payload.frequency}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar
                            dataKey="frequency"
                            radius={[4, 4, 0, 0]}
                          >
                            {generateHistogramData(analysisResult.market_cap_change_analysis).histogram.map((entry: { value: number, frequency: number, start: number, end: number }, index: number) => {
                              if (!selectedStrategy || typeof entry.value !== 'number') {
                                return <Cell key={`cell-${index}`} fill="var(--primary)" />;
                              }

                              const stats = analysisResult.market_cap_change_analysis.stats;
                              let range;
                              let color;

                              switch (selectedStrategy) {
                                case 'high_return':
                                  range = { min: stats['75%'], max: stats.max };
                                  color = (entry.value >= range.min)
                                    ? 'rgba(255, 99, 132, 1)'
                                    : 'rgba(200, 200, 200, 0.3)';
                                  break;
                                case 'risk_averse':
                                  range = { min: stats['25%'], max: stats.max };
                                  color = (entry.value >= range.min)
                                    ? 'rgba(54, 162, 235, 1)'
                                    : 'rgba(200, 200, 200, 0.3)';
                                  break;
                                case 'stable':
                                  range = { min: stats['25%'], max: stats['75%'] };
                                  color = (entry.start <= range.max && entry.end >= range.min)
                                    ? 'rgba(130, 202, 157, 1)'
                                    : 'rgba(200, 200, 200, 0.3)';
                                  break;
                                default:
                                  color = "var(--primary)";
                              }

                              return <Cell key={`cell-${index}`} fill={color} />;
                            })}
                          </Bar>
                          <ReferenceLine
                            x={analysisResult.market_cap_change_analysis.stats.mean}
                            stroke="var(--primary)"
                            strokeDasharray="3 3"
                            label={{
                              value: '평균',
                              position: 'top',
                              fill: 'var(--primary)',
                              fontSize: 12
                            }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 후보 종목 목록 테이블을 별도의 카드로 분리 */}
      {sortedData && (
        <Card>
          <CardHeader>
            <CardTitle>후보 종목 목록</CardTitle>
            <CardDescription>
              선택된 전략: {appliedStrategy === 'high_return' ? '고수익성' :
                appliedStrategy === 'risk_averse' ? '위험회피' :
                  appliedStrategy === 'stable' ? '안정성' : '없음'}
              <br />
              필터링된 종목 수: {sortedData.length}개
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>종목코드</TableHead>
                    <TableHead>종목명</TableHead>
                    <TableHead
                      className="text-right cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('start_closingPrice')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        시작가
                        {sortConfig.key === 'start_closingPrice' ? (
                          sortConfig.direction === 'desc' ? (
                            <ArrowDown className="h-4 w-4" />
                          ) : (
                            <ArrowUp className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-right cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('end_closingPrice')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        종료가
                        {sortConfig.key === 'end_closingPrice' ? (
                          sortConfig.direction === 'desc' ? (
                            <ArrowDown className="h-4 w-4" />
                          ) : (
                            <ArrowUp className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-right cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('annual_return')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        수익률
                        {sortConfig.key === 'annual_return' ? (
                          sortConfig.direction === 'desc' ? (
                            <ArrowDown className="h-4 w-4" />
                          ) : (
                            <ArrowUp className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-right cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('market_cap_change')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        시가총액 변화율
                        {sortConfig.key === 'market_cap_change' ? (
                          sortConfig.direction === 'desc' ? (
                            <ArrowDown className="h-4 w-4" />
                          ) : (
                            <ArrowUp className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedData.map((stock) => (
                    <TableRow key={stock.stockCode}>
                      <TableCell>{stock.stockCode}</TableCell>
                      <TableCell>{stock.stockName}</TableCell>
                      <TableCell className="text-right">{formatNumber(stock.start_closingPrice)}</TableCell>
                      <TableCell className="text-right">{formatNumber(stock.end_closingPrice)}</TableCell>
                      <TableCell className="text-right">{formatPercent(stock.annual_return)}</TableCell>
                      <TableCell className="text-right">{formatPercent(stock.market_cap_change)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
