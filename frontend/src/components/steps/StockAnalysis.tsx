'use client';

import { useState } from 'react';
import { fetchStocks } from '@/lib/api';
import { formatNumber, formatPercent, formatCurrency } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StockRequest, Stock } from '@/types/stock';
import { useAnalysis } from '@/contexts/AnalysisContext';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { La_Belle_Aurore } from 'next/font/google';

type SortConfig = {
  key: keyof Stock | null;
  direction: 'asc' | 'desc';
};

export function StockAnalysis() {
  const { state, dispatch } = useAnalysis();
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'desc' });
  const [filters, setFilters] = useState<StockRequest>({
    startDd: '2024',
    etf_filter: false,
    inverse_filter: false,
    sector_filter: false,
    preferred_filter: false,
    etc_filter: false,
    top_percent: 40,
    bottom_percent: 80,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSort = (key: keyof Stock) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortedData = () => {
    if (!state.step1Data?.data || !sortConfig.key) return state.step1Data?.data;

    return [...state.step1Data.data].sort((a, b) => {
      const aValue = a[sortConfig.key!];
      const bValue = b[sortConfig.key!];

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }
      return 0;
    });
  };

  const handleFilterChange = (key: keyof StockRequest, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleDateChange = (value: string) => {
    handleFilterChange('startDd', value);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>, key: 'top_percent' | 'bottom_percent') => {
    const value = e.target.value.replace(/^0+/, ''); // Remove leading zeros
    const numValue = value === '' ? 0 : parseInt(value, 10);
    if (numValue >= 0 && numValue <= 100) {
      handleFilterChange(key, numValue);
    }
  };

  const handleCheckboxChange = (checked: boolean, key: keyof StockRequest) => {
    handleFilterChange(key, checked);
  };

  const handleCollectData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 새로운 데이터 수집 시 모든 단계 초기화
      dispatch({ type: 'RESET_ALL' });

      const result = await fetchStocks(filters);
      dispatch({
        type: 'SET_STEP1_DATA',
        payload: {
          ...result,
          request: filters
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '데이터 수집 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>필터 설정</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">년도</label>
              <Select value={filters.startDd} onValueChange={handleDateChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="년도 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20230101">2023년</SelectItem>
                  <SelectItem value="20240101">2024년</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="space-y-1">
                <div className="flex items-start gap-8">
                  <span className="text-sm flex-1 text-center">시가총액 하위</span>
                  <span className="text-sm flex-1 text-center">시가총액 상위</span>
                </div>
                <div className="flex justify-center gap-4">
                  <div className="flex items-center">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={filters.top_percent || ''}
                      placeholder="40"
                      onChange={(e) => handleNumberChange(e, 'top_percent')}
                      className="w-20"
                    />
                    <span className="text-sm ml-1">%</span>
                  </div>
                  <span className="text-sm">~</span>
                  <div className="flex items-center">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={filters.bottom_percent || ''}
                      placeholder="80"
                      onChange={(e) => handleNumberChange(e, 'bottom_percent')}
                      className="w-20"
                    />
                    <span className="text-sm ml-1">%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <Button
                onClick={handleCollectData}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? '데이터 수집 중...' : '데이터 수집'}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mt-4">
            <label className="text-sm font-medium">종목 필터(제외) : </label>
            <label className="flex items-center space-x-2">
              <Checkbox
                checked={filters.etf_filter}
                onCheckedChange={(checked) => handleCheckboxChange(checked as boolean, 'etf_filter')}
              />
              <span>ETF</span>
            </label>

            <label className="flex items-center space-x-2">
              <Checkbox
                checked={filters.inverse_filter}
                onCheckedChange={(checked) => handleCheckboxChange(checked as boolean, 'inverse_filter')}
              />
              <span>인버스</span>
            </label>

            <label className="flex items-center space-x-2">
              <Checkbox
                checked={filters.sector_filter}
                onCheckedChange={(checked) => handleCheckboxChange(checked as boolean, 'sector_filter')}
              />
              <span>섹터</span>
            </label>

            <label className="flex items-center space-x-2">
              <Checkbox
                checked={filters.preferred_filter}
                onCheckedChange={(checked) => handleCheckboxChange(checked as boolean, 'preferred_filter')}
              />
              <span>우선주</span>
            </label>

            <label className="flex items-center space-x-2">
              <Checkbox
                checked={filters.etc_filter}
                onCheckedChange={(checked) => handleCheckboxChange(checked as boolean, 'etc_filter')}
              />
              <span>기타(배당)</span>
            </label>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div className="text-center py-8">
          <div className="text-red-500 mb-4">
            {error}
          </div>
          <Button
            onClick={handleCollectData}
            variant="outline"
          >
            다시 시도
          </Button>
        </div>
      ) : state.step1Data?.data ? (
        <Card>
          <CardHeader>
            <CardTitle>주식 데이터</CardTitle>
            <CardDescription>
              시가총액 범위: 하위 {filters.top_percent}% ~ 상위 {filters.bottom_percent}%
              <br />
              수집된 종목 수: {state.step1Data?.data?.length || 0} 종목
              <br />
              기준 년도: {filters.startDd}
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
                  {getSortedData()?.map((stock) => (
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
      ) : null}
    </div>
  );
} 