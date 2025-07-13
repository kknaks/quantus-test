'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { useAnalysis } from '@/contexts/AnalysisContext';
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { getFinancialStatements } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

interface FinancialData {
  category: string;
  subject: string;
  find: string;
  quarters: {
    [key: string]: number;
  };
}

interface CompanyData {
  corp_name: string;
  data: FinancialData[];
}

interface FinancialResponse {
  data: CompanyData[];
}

export const FinancialAnalysis: React.FC = () => {
  const { state, dispatch } = useAnalysis();
  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [financialData, setFinancialData] = useState<FinancialResponse | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  const selectedStocks = state.step3Data?.candidates?.data || [];

  // 상태 복원
  useEffect(() => {
    if (state.step4Data) {
      setSelectedCount(state.step4Data.selectedCount);
      setFinancialData(state.step4Data.financialData);
      setSelectedCompany(state.step4Data.selectedCompany);
    }
  }, [state.step4Data]);

  const strategyNames = {
    'high_return': '고수익 추구',
    'risk_averse': '위험 회피',
    'stable': '안정성 추구',
  };

  const filterNames = {
    'annual_return': '수익률',
    'market_cap': '시가총액',
  };

  const stockCountOptions = [30, 50, 80, 100].filter(count => count <= selectedStocks.length);

  const handleCollectFinancialData = async () => {
    if (!selectedCount || !state.step1Data?.request.startDd) return;

    try {
      setIsLoading(true);
      const startYear = state.step1Data.request.startDd.substring(0, 4);
      const response = await getFinancialStatements({
        data: selectedStocks,
        analysis_cnt: selectedCount,
        start_date: `${startYear}0101`,
        end_date: `${startYear}1231`,
      });

      setFinancialData(response);
      if (response.data.length > 0) {
        setSelectedCompany(response.data[0].corp_name);
      }

      // Context 업데이트
      dispatch({
        type: 'SET_STEP4_DATA',
        payload: {
          selectedCount,
          financialData: response,
          selectedCompany: response.data.length > 0 ? response.data[0].corp_name : null,
        },
      });

      console.log('Financial statements collected:', response);

    } catch (error) {
      console.error('Failed to collect financial statements:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // selectedCompany가 변경될 때마다 Context 업데이트
  useEffect(() => {
    if (financialData && selectedCompany) {
      dispatch({
        type: 'SET_STEP4_DATA',
        payload: {
          selectedCount,
          financialData,
          selectedCompany,
        },
      });
    }
  }, [selectedCompany, dispatch, financialData, selectedCount]);

  const selectedCompanyData = financialData?.data.find(
    company => company.corp_name === selectedCompany
  );

  const formatValue = (value: number) => {
    return new Intl.NumberFormat('ko-KR').format(value);
  };

  // 연도_분기코드 형식을 표시 텍스트로 변환하는 함수
  const getQuarterDisplay = (yearQuarterCode: string) => {
    const [year, quarterCode] = yearQuarterCode.split('_');
    const quarterMap: { [key: string]: string } = {
      "11013": "1분기",
      "11012": "2분기",
      "11014": "3분기",
      "11011": "4분기"
    };
    return `${year}년 ${quarterMap[quarterCode] || quarterCode}`;
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <CardHeader>
          <CardTitle>재무 분석</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 왼쪽: 정보 표시 */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-500 w-32">기준 년도:</span>
              <span className="text-lg font-semibold">
                {state.step1Data?.request.startDd.substring(0, 4)}년
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-500 w-32">필터 구분:</span>
              <span className="text-lg font-semibold">
                {filterNames[state.step3Data?.activeTab as keyof typeof filterNames] || '선택된 필터 없음'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-500 w-32">선택한 전략:</span>
              <span className="text-lg font-semibold">
                {strategyNames[state.step3Data?.selectedStrategy as keyof typeof strategyNames] || '선택된 전략 없음'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-500 w-32">선택된 종목 수:</span>
              <span className="text-lg font-semibold">{selectedStocks.length}개</span>
            </div>
          </div>

          {/* 오른쪽: 라디오 버튼과 실행 버튼 */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">분석할 종목 수</h3>
              <RadioGroup
                value={selectedCount?.toString()}
                onValueChange={(value) => setSelectedCount(Number(value))}
                className="flex flex-wrap gap-4"
              >
                {stockCountOptions.map((count) => (
                  <div key={count} className="flex items-center space-x-2">
                    <RadioGroupItem value={count.toString()} id={`count-${count}`} />
                    <Label htmlFor={`count-${count}`}>{count}종목</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <Button
              onClick={handleCollectFinancialData}
              disabled={!selectedCount || isLoading}
              className="float-right"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  재무제표 수집 중...
                </div>
              ) : '재무제표 수집'}
            </Button>
          </div>
        </div>
      </Card>

      {isLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-sm mx-auto">
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
              <p className="text-lg font-medium">재무제표 수집 중...</p>
              <p className="text-sm text-gray-500 text-center">
                선택하신 {selectedCount}개 종목의 재무제표를 수집하고 있습니다.<br />
                잠시만 기다려주세요.
              </p>
            </div>
          </Card>
        </div>
      )}

      {financialData && !isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* 왼쪽: 기업 리스트 */}
          <Card className="p-4 gap-0">
            <h2 className="text-lg font-semibold mb-4">기업 목록</h2>
            <div className="space-y-2">
              {financialData.data.map((company) => (
                <Button
                  key={company.corp_name}
                  variant={selectedCompany === company.corp_name ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => setSelectedCompany(company.corp_name)}
                >
                  {company.corp_name}
                </Button>
              ))}
            </div>
          </Card>

          {/* 오른쪽: 재무제표 데이터 */}
          <Card className="p-4 col-span-3 gap-0">
            <h2 className="text-lg font-semibold mb-4">재무제표 데이터</h2>
            {selectedCompanyData && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>항목</TableHead>
                      {Object.keys(selectedCompanyData.data[0].quarters).map((yearQuarter) => (
                        <TableHead key={yearQuarter}>{getQuarterDisplay(yearQuarter)}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedCompanyData.data.map((item, index) => (
                      <TableRow key={`${item.subject}-${index}`}>
                        <TableCell>{item.subject}</TableCell>
                        {Object.entries(item.quarters).map(([yearQuarter, value]) => (
                          <TableCell key={yearQuarter}>
                            {item.subject === 'report_date'
                              ? value?.toString() || '-'
                              : formatValue(value)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
