import pandas as pd
import numpy as np
from fastapi.logger import logger
from typing import List

from app.schemas.stock import StockData, StockCmpData
from app.service.invest_idx import InvestIdxService
from app.service.stock_filter import StockFilterService
from app.service.krx_api import KrxApi
from app.service.dart_api import DartApi

invest_idx_service = InvestIdxService()
stock_filter_service = StockFilterService()
krx_api = KrxApi()
dart_api = DartApi()

class BackTestService:
  def __init__(self):
      pass

  def run_back_test(self):
      pass
  
  def generate_test_data(self, data : List[StockData], start_date : str, end_date : str, test_case : int):
    end_data = krx_api.get_stock_list_with_next_day(end_date)
    cmp_data, annual_return_analysis, market_cap_change_analysis = stock_filter_service.calculate_cmp_data(data, end_data)

    cmp_case_data = cmp_data.iloc[:test_case]
    
    test_statements = dart_api.get_corp_statement(cmp_case_data, start_date, end_date)
    stock_range_info = invest_idx_service.get_stock_file(start_date)
    # DataFrame을 List[StockCmpData]로 변환
    stock_cmp_data = [StockCmpData(**record) for record in cmp_data.to_dict(orient='records')]
    test_range_info = invest_idx_service.get_candidates_range_info(stock_cmp_data, stock_range_info)
    test_data_df = invest_idx_service.create_company_analysis_dataframe(test_range_info, test_statements)
    
    return test_data_df
      

  def run_monthly_rebalancing_backtest(self, data, initial_capital:int, top_n : int, screening_criteria : dict):    
    print(f"📊 백테스트 데이터 정보:")
    print(f"   - 데이터 shape: {data.shape}")
    print(f"   - 컬럼명: {data.columns.tolist()}")
    print(f"   - 구분 값들: {data['구분'].unique()}")
    
    rebalancing_dates = self._get_rebalancing_dates(data)
    print(f"📅 리밸런싱 날짜: {rebalancing_dates}")
    
    backtest_results = {
        'monthly_returns': [],
        'monthly_portfolios': [],
        'cumulative_returns': [],
        'total_capital': [initial_capital]
    }
    
    current_capital = initial_capital
    
    for i, current_date in enumerate(rebalancing_dates):
        month_num = i + 1
        
        try:
            # 1단계: 해당 월의 재무지표 추출
            fundamentals = self._get_fundamentals_at_date(data, current_date)
            print(f"📊 {month_num}월 재무지표 추출 결과:")
            print(f"   - 데이터 shape: {fundamentals.shape}")
            print(f"   - 컬럼명: {fundamentals.columns.tolist()}")
            if not fundamentals.empty:
                print(f"   - 첫 3개 종목:")
                for i in range(min(3, len(fundamentals))):
                    print(f"     {fundamentals.index[i]}: {fundamentals.iloc[i].to_dict()}")
            if fundamentals.empty:
                logger.error(f"{month_num}월: 재무지표 데이터 없음")
                continue
            
            # 2단계: 종목 스크리닝
            selected_stocks, screening_results, rejection_reasons = self._screen_stocks_monthly(fundamentals, screening_criteria)
            print(f"📋 {month_num}월 스크리닝 결과: {len(selected_stocks)}개 종목 선별")
            print(f"   - 스크리닝 기준: {screening_criteria}")
            print(f"   - 거절 사유: {rejection_reasons}")
            if len(selected_stocks) > 0:
                print(f"   - 선별된 종목: {selected_stocks[:5]}")  # 최대 5개만 출력
            
            if len(selected_stocks) < top_n:
                logger.error(f"{month_num}월: 선별 종목 부족 ({len(selected_stocks)}개)")
                current_top_n = min(len(selected_stocks), top_n)
            else:
                current_top_n = top_n
            
            # 3단계: 포트폴리오 구성
            portfolio = self._calculate_factor_scores_and_portfolio(
                fundamentals, selected_stocks, top_n=current_top_n
            )
            
            if portfolio.empty:
                logger.error(f"{month_num}월: 포트폴리오 구성 실패")
                continue
            
            # 4단계: 다음 월까지의 수익률 계산
            if i < len(rebalancing_dates) - 1:
                next_date = rebalancing_dates[i + 1]
                
                current_portfolio = {}
                for _, row in portfolio.iterrows():
                    current_portfolio[row['종목명']] = row['포트폴리오_비중']
                
                monthly_result = self._calculate_monthly_returns(
                    data, current_portfolio, current_date, next_date
                )
                
                monthly_return_pct = monthly_result['portfolio_return']
                current_capital = current_capital * (1 + monthly_return_pct / 100)
                
                backtest_results['monthly_returns'].append(monthly_return_pct)
                backtest_results['monthly_portfolios'].append(current_portfolio)
                backtest_results['total_capital'].append(current_capital)
                
                cumulative_return = (current_capital - initial_capital) / initial_capital * 100
                backtest_results['cumulative_returns'].append(cumulative_return)
            
            else:
                print(f"📊 {month_num}월: 마지막 월 (수익률 계산 없음)")
                
        except Exception as e:
            logger.error(f"{month_num}월 처리 중 오류: {e}")
            continue
        
    
    # 최종 성과 계산
    final_return = (current_capital - initial_capital) / initial_capital * 100
    
    if backtest_results['monthly_returns']:
        monthly_returns = backtest_results['monthly_returns']
        avg_monthly = np.mean(monthly_returns)
        volatility = np.std(monthly_returns)
        
        best_month = max(monthly_returns)
        worst_month = min(monthly_returns)
        print(f"   최고 월간수익: {best_month:+6.2f}%")
        print(f"   최저 월간수익: {worst_month:+6.2f}%")
    
    # 결과 딕셔너리에 최종 정보 추가
    backtest_results.update({
        'initial_capital': initial_capital,
        'final_capital': current_capital,
        'total_return': final_return,
        'rebalancing_dates': rebalancing_dates
    })
    
    return backtest_results
  
  def _get_rebalancing_dates(self, data : pd.DataFrame):
    date_cols = [col for col in data.columns if col.isdigit() and len(col) == 8]
    date_cols.sort()
    
    monthly_dates = {}
    for date in date_cols:
        month = date[:6]  
        monthly_dates[month] = date
    
    rebalancing_dates = list(monthly_dates.values())
    
    return rebalancing_dates
  
  def _get_fundamentals_at_date(
        self, data : pd.DataFrame,
        target_date : str, 
        metrics : list[str]=['PER', 'PBR', 'ROE', 'ROA', '영업이익률', '부채비율']):
    if target_date not in data.columns:
        available_dates = [col for col in data.columns if col.isdigit() and col <= target_date]
        if not available_dates:
            return pd.DataFrame()
        target_date = max(available_dates)
    
    fundamentals = {}
    
    for metric in metrics:
        metric_data = data[data['구분'] == metric]
        
        if not metric_data.empty:
            metric_values = metric_data.set_index('종목명')[target_date].to_dict()
            fundamentals[metric] = metric_values
    
    fund_df = pd.DataFrame(fundamentals)
    
    min_data_count = len(metrics) // 2
    fund_df = fund_df.dropna(thresh=min_data_count)
    
    return fund_df
  
  def _screen_stocks_monthly(self, fund_df :pd.DataFrame, screening_criteria:dict):
      selected_stocks = []
      screening_results = {}
      
      print(f"🔍 스크리닝 대상 종목 수: {len(fund_df)}")
      print(f"🔍 사용 가능한 지표: {fund_df.columns.tolist()}")
      
      for stock in fund_df.index:
          passed = True
          stock_results = {}
          
          for metric, (min_val, max_val) in screening_criteria.items():
              if metric not in fund_df.columns:
                  print(f"⚠️  {stock}: {metric} 지표 없음")
                  continue
                  
              value = fund_df.loc[stock, metric]
              
              # 결측치 체크 - PER의 경우 더 유연하게 처리
              if pd.isna(value):
                  if metric == 'PER':
                      # PER 결측치는 건너뛰고 다른 지표로 평가
                      stock_results[metric] = f"결측치 (건너뜀)"
                      continue
                  else:
                      passed = False
                      stock_results[metric] = f"결측치"
                      break
              
              # 기준 체크
              if value < min_val or value > max_val:
                  passed = False
                  stock_results[metric] = f"{value:.2f} (범위초과: {min_val}~{max_val})"
                  break
              else:
                  stock_results[metric] = f"{value:.2f} (통과)"
          
          screening_results[stock] = {
              'passed': passed,
              'details': stock_results
          }
          
          if passed:
              selected_stocks.append(stock)
          else:
              # 첫 번째 종목의 실패 사유를 자세히 출력
              if len(screening_results) <= 3:
                  print(f"❌ {stock} 탈락: {stock_results}")
      
      rejection_reasons = {}
      for stock, result in screening_results.items():
          if not result['passed']:
              for metric, detail in result['details'].items():
                  if '범위초과' in detail or '결측치' in detail:
                      if metric not in rejection_reasons:
                          rejection_reasons[metric] = 0
                      rejection_reasons[metric] += 1
                      break 
      
      return selected_stocks, screening_results, rejection_reasons

  def _calculate_factor_scores_and_portfolio(self, fund_df : pd.DataFrame, selected_stocks : list[str], top_n=10):
      if len(selected_stocks) == 0:
          logger.info(" 스크리닝 통과 종목이 없습니다.")
          return pd.DataFrame()
      
      scores = []
      
      for stock in selected_stocks:
          try:
              per = fund_df.loc[stock, 'PER'] if 'PER' in fund_df.columns else np.nan
              pbr = fund_df.loc[stock, 'PBR'] if 'PBR' in fund_df.columns else np.nan
              roe = fund_df.loc[stock, 'ROE'] if 'ROE' in fund_df.columns else np.nan
              roa = fund_df.loc[stock, 'ROA'] if 'ROA' in fund_df.columns else np.nan
              profit_margin = fund_df.loc[stock, '영업이익률'] if '영업이익률' in fund_df.columns else np.nan
              
              if pd.isna(per) or pd.isna(pbr) or pd.isna(roe):
                  continue
              
              # 팩터 스코어 계산
              value_score = (1/per + 1/pbr) * 50  # 스케일링
              
              quality_components = [roe, roa, profit_margin]
              quality_values = [x for x in quality_components if pd.notna(x)]
              quality_score = np.mean(quality_values) if quality_values else 0
              
              momentum_score = roe 
              
              # 종합 점수 (가중평균)
              total_score = (value_score * 0.4 + 
                            quality_score * 0.5 + 
                            momentum_score * 0.1)
              
              scores.append({
                  '종목명': stock,
                  'PER': per,
                  'PBR': pbr,
                  'ROE': roe,
                  'ROA': roa if pd.notna(roa) else 0,
                  '영업이익률': profit_margin if pd.notna(profit_margin) else 0,
                  'Value점수': value_score,
                  'Quality점수': quality_score,
                  'Momentum점수': momentum_score,
                  '종합점수': total_score
              })
              
          except Exception as e:
              logger.error(f"{stock} 계산 오류: {e}")
              continue
      
      if not scores:
          logger.info(" 팩터 스코어 계산 가능한 종목이 없습니다.")
          return pd.DataFrame()
      
      score_df = pd.DataFrame(scores)
      score_df = score_df.sort_values('종합점수', ascending=False)
      
      top_stocks = score_df.head(top_n)
      
      # 포트폴리오 가중치 (동일가중)
      portfolio_weights = {}
      weight_per_stock = 1.0 / len(top_stocks)
      
      for _, row in top_stocks.iterrows():
          portfolio_weights[row['종목명']] = weight_per_stock
      
      top_stocks = top_stocks.copy()
      top_stocks['포트폴리오_비중'] = weight_per_stock
      
      return top_stocks
  
  def _calculate_monthly_returns(self, stock_data : pd.DataFrame, portfolio_stocks : dict, start_date : str, end_date : str):
      price_data = stock_data[stock_data['구분'] == 'closingPrice'].set_index('종목명')
      
      print(f"💰 월별 수익률 계산 ({start_date} → {end_date}):")
      print(f"   - 포트폴리오 종목: {list(portfolio_stocks.keys())}")
      print(f"   - 가격 데이터 shape: {price_data.shape}")
      print(f"   - 가격 데이터 종목: {price_data.index.tolist()}")
      
      portfolio_return = 0
      stock_returns = {}
      valid_stocks = 0
      
      for stock, weight in portfolio_stocks.items():
          try:
              # 종목이 가격 데이터에 있는지 확인
              if stock not in price_data.index:
                  print(f"❌ {stock}: 가격 데이터에 종목 없음")
                  continue
              
              # 날짜 컬럼이 있는지 확인
              if start_date not in price_data.columns or end_date not in price_data.columns:
                  print(f"❌ {stock}: 날짜 컬럼 없음 (시작:{start_date in price_data.columns}, 종료:{end_date in price_data.columns})")
                  continue
              
              start_price = price_data.loc[stock, start_date]
              end_price = price_data.loc[stock, end_date]
              
              print(f"📈 {stock}: {start_price} → {end_price} (비중: {weight:.1%})")
              
              if pd.isna(start_price) or pd.isna(end_price) or start_price <= 0:
                  print(f"❌ {stock}: 가격 데이터 없음 (시작:{start_price}, 종료:{end_price})")
                  continue
              
              stock_return = (end_price - start_price) / start_price * 100
              stock_returns[stock] = stock_return
              
              contribution = stock_return * weight
              portfolio_return += contribution
              valid_stocks += 1
              
              print(f"✅ {stock}: 수익률 {stock_return:+.2f}%, 기여도 {contribution:+.2f}%")
              
          except Exception as e:
              print(f"❌ {stock}: 상세 오류 - {type(e).__name__}: {e}")
              continue
      
      # 결과 정리
      result = {
          'portfolio_return': portfolio_return,
          'stock_returns': stock_returns,
          'valid_stocks': valid_stocks,
          'total_stocks': len(portfolio_stocks),
          'period': f"{start_date}-{end_date}"
      }
      return result

