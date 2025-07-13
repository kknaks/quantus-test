'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAnalysis } from '@/contexts/AnalysisContext';
import { fetchVolumeStats, applyVolumeFilter } from '@/lib/api';
import { Stock, VolumeFilterType } from '@/types/stock';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, ReferenceArea } from 'recharts';
import {
  Card as CardUI,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber, formatCurrency } from '@/lib/utils';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

type VolumeRangeType = 'IQR' | '25-75' | 'All' | null;

type SortConfig = {
  key: keyof Stock | null;
  direction: 'asc' | 'desc';
};

export function VolumeAnalysis() {
  const { state, dispatch } = useAnalysis();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<VolumeRangeType>(null);
  const [filteredStocks, setFilteredStocks] = useState<Stock[] | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'desc' });

  // 최대 거래량 계산 (천 단위)
  const maxVolume = useMemo(() => {
    if (!state.step1Data?.data) return 0;
    const max = Math.max(...state.step1Data.data.map(stock => stock.tradingVolume));
    // 천 단위로 변환하고 올림하여 적절한 범위 설정
    return Math.ceil(max / 1000);
  }, [state.step1Data]);

  // X축 눈금 생성
  const xAxisTicks = useMemo(() => {
    if (!maxVolume) return [];
    const tickCount = 6; // 표시할 눈금 수
    const interval = Math.ceil(maxVolume / (tickCount - 1));
    return Array.from({ length: tickCount }, (_, i) => i * interval);
  }, [maxVolume]);

  // 히스토그램 데이터 생성
  const histogramData = useMemo(() => {
    if (!state.step1Data?.data) return [];

    // 거래량을 천 단위로 변환
    const volumes = state.step1Data.data.map(stock => stock.tradingVolume / 1000);
    const min = Math.min(...volumes);
    const max = Math.max(...volumes);

    // 구간 개수 계산 (더 세밀한 구간으로)
    const binCount = 50; // 더 부드러운 곡선을 위해 구간 수 증가
    const binWidth = (max - min) / binCount;

    // 구간별 빈도 계산
    const bins = Array(binCount).fill(0);
    volumes.forEach(volume => {
      const binIndex = Math.min(
        Math.floor((volume - min) / binWidth),
        binCount - 1
      );
      bins[binIndex]++;
    });

    // 차트 데이터 생성
    return bins.map((count, index) => ({
      거래량: Math.round(min + (index + 0.5) * binWidth), // 구간의 중간값을 x축으로 사용
      빈도: count,
    }));
  }, [state.step1Data]);

  // 최대 빈도 계산
  const maxFrequency = useMemo(() => {
    if (!histogramData.length) return 0;
    return Math.max(...histogramData.map(d => d.빈도));
  }, [histogramData]);

  // 컴포넌트 마운트 시 step2Data에서 필터링된 데이터 복원
  useEffect(() => {
    if (state.step2Data?.filtered_stocks) {
      setFilteredStocks(state.step2Data.filtered_stocks);
      // 필터 타입도 복원
      if (state.step2Data.filter_type === 'PERCENT') setSelectedRange('25-75');
      else if (state.step2Data.filter_type === 'IQR') setSelectedRange('IQR');
      else if (state.step2Data.filter_type === 'ALL') setSelectedRange('All');
    }
  }, [state.step2Data]);

  const handleAnalyze = async () => {
    if (!state.step1Data) {
      setError('먼저 Step 1에서 주식 데이터를 수집해주세요.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const stats = await fetchVolumeStats(state.step1Data.data);

      if (!stats || !stats.data || !stats.data.tradingVolume) {
        throw new Error('거래량 통계 데이터가 올바르지 않습니다.');
      }

      dispatch({ type: 'SET_STEP2_DATA', payload: stats.data });
      // 분석이 완료되면 기본적으로 '25-75' 범위 오버레이를 선택하도록 설정
      setSelectedRange('25-75');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '거래량 통계를 가져오는데 실패했습니다.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilter = async () => {
    if (!selectedRange || !state.step1Data?.data) return;

    try {
      setLoading(true);
      setError(null);

      const filterType = selectedRange === '25-75' ? VolumeFilterType.PERCENT :
        selectedRange === 'IQR' ? VolumeFilterType.IQR : VolumeFilterType.ALL;

      const result = await applyVolumeFilter(state.step1Data.data, filterType);
      setFilteredStocks(result.data);

      // step2Data에 필터링된 데이터와 필터 타입을 함께 저장
      dispatch({
        type: 'SET_STEP2_DATA',
        payload: {
          tradingVolume: state.step2Data!.tradingVolume,  // 기존 tradingVolume 유지
          filtered_stocks: result.data,
          filter_type: filterType
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '거래량 필터링 중 오류가 발생했습니다.');
      setFilteredStocks(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key: keyof Stock) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortedData = () => {
    if (!filteredStocks || !sortConfig.key) return filteredStocks;

    return [...filteredStocks].sort((a, b) => {
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

  const sortedData = getSortedData();

  // 그래프 오버레이 렌더링 함수
  const renderVolumeOverlay = () => {
    if (!state.step2Data?.tradingVolume || !selectedRange) return null;

    const stats = state.step2Data.tradingVolume;
    let x1: number, x2: number;
    let label: string = '';
    let color: string = '#8884d8';

    // 통계치를 천 단위로 변환하여 히스토그램 X축 단위에 맞춥니다.
    const stat25 = stats['25%'] / 1000;
    const stat75 = stats['75%'] / 1000;
    const statMin = stats.min / 1000;
    const statMax = stats.max / 1000;

    switch (selectedRange) {
      case 'IQR':
        const iqr = stat75 - stat25;
        x1 = Math.max(0, stat25 - 1.5 * iqr);
        x2 = stat75 + 1.5 * iqr;
        label = 'IQR 기반 정상 범위';
        color = 'rgba(54, 162, 235, 1)';
        break;
      case '25-75':
        x1 = stat25;
        x2 = stat75;
        label = '25% ~ 75% 백분위 범위';
        color = 'rgba(130, 202, 157, 1)';
        break;
      case 'All':
        x1 = statMin;
        x2 = statMax;
        label = '전체 거래량 범위';
        color = 'rgba(255, 99, 132, 1)';
        break;
      default:
        return null;
    }

    return (
      <ReferenceArea
        x1={x1}
        x2={x2}
        y1={0}
        y2={maxFrequency}
        fill={color}
        fillOpacity={0.3}
        stroke={color}
        strokeOpacity={1}
        strokeWidth={2}
        label={{
          value: label,
          position: 'top',
          fill: color.replace(', 0.8)', ', 1)'),
          fontSize: 12,
          fontWeight: 'bold',
          dy: -20
        }}
        ifOverflow="extendDomain"
      />
    );
  };


  if (!state.step1Data) {
    return (
      <div className="p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-yellow-700">먼저 Step 1에서 주식 데이터를 수집해주세요.</div>
        </div>
      </div>
    );
  }

  // Step 1 데이터 요약 계산
  const stockCount = state.step1Data.data.length;
  const marketCaps = state.step1Data.data.map((stock: Stock) => stock.marketCap);
  const minMarketCap = Math.min(...marketCaps);
  const maxMarketCap = Math.max(...marketCaps);
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="p-4 space-y-4">
      <Card className="p-6 gap-1">
        <CardHeader>
          <CardTitle>수집된 데이터 개요</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <h4 className="text-sm text-gray-500">수집된 주식 수</h4>
                <p className="text-lg font-medium">{stockCount.toLocaleString()}개</p>
              </div>
              <div>
                <h4 className="text-sm text-gray-500">시가총액 범위</h4>
                <p className="text-lg font-medium">
                  {(minMarketCap / 100000000).toFixed(0)}억원 ~ {(maxMarketCap / 100000000).toFixed(0)}억원
                </p>
              </div>
              <div>
                <h4 className="text-sm text-gray-500">기준일</h4>
                <p className="text-lg font-medium">{today}</p>
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button
              onClick={handleAnalyze}
              disabled={loading}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  분석 중
                </div>
              ) : (
                '거래량 통계 분석'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 2. 거래량 통계 및 필터링 */}
      {state.step2Data && (
        <Card className="p-6">
          <CardHeader>
            <CardTitle>거래량 통계 및 필터링</CardTitle>
            <CardDescription>거래량 범위를 적용해야 다음 단계로 넘어갈 수 있습니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 통계 요약 정보 */}
            <div className="grid grid-cols-4 gap-4 mb-2">
              <div>
                <h4 className="text-sm text-gray-500">평균 거래량</h4>
                <p className="text-lg font-medium">{Math.round(state.step2Data.tradingVolume.mean).toLocaleString()}</p>
              </div>
              <div>
                <h4 className="text-sm text-gray-500">중앙값</h4>
                <p className="text-lg font-medium">{Math.round(state.step2Data.tradingVolume['50%']).toLocaleString()}</p>
              </div>
              <div>
                <h4 className="text-sm text-gray-500">표준편차</h4>
                <p className="text-lg font-medium">{Math.round(state.step2Data.tradingVolume.std).toLocaleString()}</p>
              </div>
              <div>
                <h4 className="text-sm text-gray-500">데이터 수</h4>
                <p className="text-lg font-medium">{Math.round(state.step2Data.tradingVolume.count).toLocaleString()}</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <h4 className="text-sm text-gray-500">최소 거래량</h4>
                <p className="text-lg font-medium">{Math.round(state.step2Data.tradingVolume.min).toLocaleString()}</p>
              </div>
              <div>
                <h4 className="text-sm text-gray-500">25% 백분위</h4>
                <p className="text-lg font-medium">{Math.round(state.step2Data.tradingVolume['25%']).toLocaleString()}</p>
              </div>
              <div>
                <h4 className="text-sm text-gray-500">75% 백분위</h4>
                <p className="text-lg font-medium">{Math.round(state.step2Data.tradingVolume['75%']).toLocaleString()}</p>
              </div>
              <div>
                <h4 className="text-sm text-gray-500">최대 거래량</h4>
                <p className="text-lg font-medium">{Math.round(state.step2Data.tradingVolume.max).toLocaleString()}</p>
              </div>
            </div>

            {/* 거래량 히스토그램 */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex space-x-2">
                  <Button
                    variant={selectedRange === 'IQR' ? 'default' : 'outline'}
                    onClick={() => setSelectedRange('IQR')}
                    size="sm"
                  >
                    IQR 범위
                  </Button>
                  <Button
                    variant={selectedRange === '25-75' ? 'default' : 'outline'}
                    onClick={() => setSelectedRange('25-75')}
                    size="sm"
                  >
                    25% ~ 75%
                  </Button>
                  <Button
                    variant={selectedRange === 'All' ? 'default' : 'outline'}
                    onClick={() => setSelectedRange('All')}
                    size="sm"
                  >
                    전체 범위
                  </Button>
                  <Button
                    variant={selectedRange === null ? 'default' : 'outline'}
                    onClick={() => setSelectedRange(null)}
                    size="sm"
                  >
                    오버레이 없음
                  </Button>
                </div>
                <Button
                  onClick={handleApplyFilter}
                  variant="default"
                  className="bg-primary text-white hover:bg-primary/90"
                  disabled={!selectedRange}
                >
                  {loading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      필터링 중...
                    </div>
                  ) : (
                    '필터링 적용'
                  )}
                </Button>
              </div>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={histogramData}
                    margin={{
                      top: 5,
                      right: 5,
                      left: 0,
                      bottom: 60,
                    }}
                  >
                    {renderVolumeOverlay()}
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="거래량"
                      type="number"
                      tickFormatter={(value) => `${value.toLocaleString()}K`}
                      label={{ value: '거래량 (천주)', position: 'bottom', offset: 20 }}
                      domain={[0, maxVolume]}
                      ticks={xAxisTicks}
                    />
                    <YAxis
                      dataKey="빈도"
                      hide
                      domain={[0, 'auto']}
                    />
                    <Tooltip
                      formatter={(value: any, name: string) => [value + '개', '종목 수']}
                      labelFormatter={(label) => `거래량: ${Number(label).toLocaleString()}K`}
                    />
                    <Area
                      type="monotone"
                      dataKey="빈도"
                      stroke="var(--primary)"
                      fill="var(--primary)"
                      fillOpacity={0.3}
                      strokeWidth={2}
                    />
                    {state.step2Data && state.step2Data.tradingVolume && typeof state.step2Data.tradingVolume.mean === 'number' && (
                      <ReferenceLine
                        x={state.step2Data.tradingVolume.mean / 1000}
                        stroke="red"
                        strokeDasharray="3 3"
                        label={{
                          value: '평균',
                          position: 'bottom',
                          fill: 'red',
                          fontSize: 12,
                          fontWeight: 500,
                          offset: 15,
                          dy: 10
                        }}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. 필터링된 종목 목록 */}
      {sortedData && (
        <Card className="p-6">
          <CardHeader>
            <CardTitle>필터링된 종목 목록</CardTitle>
            <CardDescription>
              선택된 거래량 범위: {selectedRange}
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
                      onClick={() => handleSort('closingPrice')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        종가
                        {sortConfig.key === 'closingPrice' ? (
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
                      onClick={() => handleSort('tradingVolume')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        거래량
                        {sortConfig.key === 'tradingVolume' ? (
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
                      onClick={() => handleSort('tradingValue')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        거래대금
                        {sortConfig.key === 'tradingValue' ? (
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
                      onClick={() => handleSort('marketCap')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        시가총액
                        {sortConfig.key === 'marketCap' ? (
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
                      <TableCell className="text-right">{formatNumber(stock.closingPrice)}</TableCell>
                      <TableCell className="text-right">{formatNumber(stock.tradingVolume)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(stock.tradingValue)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(stock.marketCap)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-700">{error}</div>
        </div>
      )}
    </div>
  );
}