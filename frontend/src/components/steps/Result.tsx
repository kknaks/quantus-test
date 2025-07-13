'use client';

import { useAnalysis } from '@/contexts/AnalysisContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber, formatPercent } from '@/lib/utils';
import { BackTestResult } from '@/types/stock';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

// Plotly 동적 임포트 (SSR 방지)
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export function Result() {
  const { state } = useAnalysis();
  const backtestResult = state.step6Data?.backtestResult;

  // 성과 지표 계산
  const performanceMetrics = useMemo(() => {
    if (!backtestResult?.monthly_returns?.length) {
      return null;
    }

    const monthlyReturns = backtestResult.monthly_returns;
    const avgMonthlyReturn = monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
    const annualizedReturn = Math.pow(1 + avgMonthlyReturn / 100, 12) - 1;

    // 변동성 계산 (월간 수익률의 표준편차)
    const variance = monthlyReturns.reduce((sum, ret) => {
      return sum + Math.pow(ret - avgMonthlyReturn, 2);
    }, 0) / monthlyReturns.length;
    const monthlyVolatility = Math.sqrt(variance);
    const annualizedVolatility = monthlyVolatility * Math.sqrt(12);

    // Sharpe Ratio (무위험 수익률 3.5% KOFR)
    const riskFreeRate = 0.035;
    const sharpeRatio = annualizedVolatility > 0 ? (annualizedReturn - riskFreeRate) / annualizedVolatility : 0;

    // 최대 낙폭 계산
    const cumulativeReturns = backtestResult.cumulative_returns || [];
    let maxDrawdown = 0;
    let peak = 0;

    cumulativeReturns.forEach(cumRet => {
      if (cumRet > peak) peak = cumRet;
      const drawdown = (peak - cumRet) / (1 + peak / 100) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });

    // 승률 계산
    const winningMonths = monthlyReturns.filter(ret => ret > 0).length;
    const winRate = winningMonths / monthlyReturns.length;

    return {
      totalReturn: backtestResult.total_return,
      annualizedReturn: annualizedReturn * 100,
      avgMonthlyReturn,
      volatility: annualizedVolatility * 100,
      sharpeRatio,
      maxDrawdown,
      winRate: winRate * 100,
      bestMonth: Math.max(...monthlyReturns),
      worstMonth: Math.min(...monthlyReturns)
    };
  }, [backtestResult]);

  // 차트 데이터 준비
  const chartData = useMemo(() => {
    if (!backtestResult?.rebalancing_dates?.length) {
      return null;
    }

    const dates = backtestResult.rebalancing_dates.map(date => {
      return `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
    });

    return {
      dates,
      monthlyReturns: backtestResult.monthly_returns || [],
      cumulativeReturns: backtestResult.cumulative_returns || [],
      totalCapital: backtestResult.total_capital || []
    };
  }, [backtestResult]);

  if (!backtestResult) {
    return (
      <div className="p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-yellow-700">
            백테스트 결과가 없습니다. 먼저 백테스트를 실행해주세요.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 전체 성과 요약 */}
      <Card>
        <CardHeader>
          <CardTitle>백테스트 성과 요약</CardTitle>
          <CardDescription>
            기간: {backtestResult.rebalancing_dates?.[0] || ''} ~ {backtestResult.rebalancing_dates?.[backtestResult.rebalancing_dates.length - 1] || ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {performanceMetrics && (
            <div className="grid grid-cols-3 gap-6">
              {/* 수익률 지표 */}
              <div className="space-y-4">
                <h4 className="font-medium text-center">수익률 지표</h4>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">총 수익률:</span>
                    <span className={`font-medium ${performanceMetrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercent(performanceMetrics.totalReturn)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">연환산 수익률:</span>
                    <span className={`font-medium ${performanceMetrics.annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercent(performanceMetrics.annualizedReturn)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">평균 월간수익률:</span>
                    <span className="font-medium">{formatPercent(performanceMetrics.avgMonthlyReturn)}</span>
                  </div>
                </div>
              </div>

              {/* 리스크 지표 */}
              <div className="space-y-4">
                <h4 className="font-medium text-center">리스크 지표</h4>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">연환산 변동성:</span>
                    <span className="font-medium">{formatPercent(performanceMetrics.volatility)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sharpe Ratio:</span>
                    <span className={`font-medium ${performanceMetrics.sharpeRatio >= 1 ? 'text-green-600' : performanceMetrics.sharpeRatio >= 0.5 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {performanceMetrics.sharpeRatio.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">최대 낙폭(MDD):</span>
                    <span className="font-medium text-red-600">{formatPercent(performanceMetrics.maxDrawdown)}</span>
                  </div>
                </div>
              </div>

              {/* 기타 지표 */}
              <div className="space-y-4">
                <h4 className="font-medium text-center">기타 지표</h4>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">승률:</span>
                    <span className="font-medium">{formatPercent(performanceMetrics.winRate)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">최고 월간수익률:</span>
                    <span className="font-medium text-green-600">{formatPercent(performanceMetrics.bestMonth)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">최저 월간수익률:</span>
                    <span className="font-medium text-red-600">{formatPercent(performanceMetrics.worstMonth)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 차트 섹션 */}
      {chartData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 누적 수익률 차트 */}
          <Card>
            <CardHeader>
              <CardTitle>누적 수익률 추이</CardTitle>
              <CardDescription>시간에 따른 누적 수익률 변화</CardDescription>
            </CardHeader>
            <CardContent>
              <Plot
                data={[
                  {
                    x: chartData.dates.slice(0, chartData.cumulativeReturns.length),
                    y: chartData.cumulativeReturns,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: '누적 수익률',
                    line: { color: '#2563eb', width: 2 },
                    marker: { size: 6 }
                  }
                ]}
                layout={{
                  title: '',
                  xaxis: { title: '날짜' },
                  yaxis: { title: '누적 수익률 (%)' },
                  margin: { l: 50, r: 20, t: 20, b: 50 },
                  height: 300,
                  hovermode: 'x unified'
                }}
                config={{ displayModeBar: false }}
                style={{ width: '100%' }}
              />
            </CardContent>
          </Card>

          {/* 월별 수익률 차트 */}
          <Card>
            <CardHeader>
              <CardTitle>월별 수익률</CardTitle>
              <CardDescription>각 월별 수익률 분포</CardDescription>
            </CardHeader>
            <CardContent>
              <Plot
                data={[
                  {
                    x: chartData.dates.slice(0, chartData.monthlyReturns.length),
                    y: chartData.monthlyReturns,
                    type: 'bar',
                    name: '월별 수익률',
                    marker: {
                      color: chartData.monthlyReturns.map(ret => ret >= 0 ? '#10b981' : '#ef4444') as any
                    }
                  }
                ]}
                layout={{
                  title: '',
                  xaxis: { title: '날짜' },
                  yaxis: { title: '월별 수익률 (%)' },
                  margin: { l: 50, r: 20, t: 20, b: 50 },
                  height: 300,
                  hovermode: 'x unified'
                }}
                config={{ displayModeBar: false }}
                style={{ width: '100%' }}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* 자본금 변화 차트 */}
      {chartData && (
        <Card>
          <CardHeader>
            <CardTitle>자본금 변화 추이</CardTitle>
            <CardDescription>시간에 따른 총 자본금 변화</CardDescription>
          </CardHeader>
          <CardContent>
            <Plot
              data={[
                {
                  x: chartData.dates.slice(0, chartData.totalCapital.length),
                  y: chartData.totalCapital,
                  type: 'scatter',
                  mode: 'lines+markers',
                  name: '총 자본금',
                  line: { color: '#059669', width: 2 },
                  marker: { size: 6 },
                  fill: 'tonexty'
                }
              ]}
              layout={{
                title: '',
                xaxis: { title: '날짜' },
                yaxis: { title: '자본금 (원)' },
                margin: { l: 80, r: 20, t: 20, b: 50 },
                height: 400,
                hovermode: 'x unified'
              }}
              config={{ displayModeBar: false }}
              style={{ width: '100%' }}
            />
          </CardContent>
        </Card>
      )}

      {/* 월별 포트폴리오 구성 */}
      {backtestResult.monthly_portfolios && backtestResult.monthly_portfolios.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>월별 포트폴리오 구성</CardTitle>
            <CardDescription>각 리밸런싱 시점의 포트폴리오 구성</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>포트폴리오 구성</TableHead>
                    <TableHead className="text-right">월간 수익률</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backtestResult.monthly_portfolios.map((portfolio, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {backtestResult.rebalancing_dates?.[index]
                          ? `${backtestResult.rebalancing_dates[index].substring(0, 4)}-${backtestResult.rebalancing_dates[index].substring(4, 6)}-${backtestResult.rebalancing_dates[index].substring(6, 8)}`
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {Object.entries(portfolio).map(([stock, weight]) => (
                            <div key={stock} className="flex justify-between text-sm">
                              <span>{stock}</span>
                              <span className="text-muted-foreground">{formatPercent(weight * 100)}</span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {backtestResult.monthly_returns?.[index] !== undefined ? (
                          <span className={backtestResult.monthly_returns[index] >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {formatPercent(backtestResult.monthly_returns[index])}
                          </span>
                        ) : '-'}
                      </TableCell>
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
