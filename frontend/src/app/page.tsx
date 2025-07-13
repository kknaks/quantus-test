'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/ui/sidebar';
import { StockAnalysis } from '@/components/steps/StockAnalysis';
import { VolumeAnalysis } from '@/components/steps/VolumeAnalysis';
import { CandidateAnalysis } from '@/components/steps/CandidateAnalysis';
import { FinancialAnalysis } from '@/components/steps/FinancialAnalysis';
import { GenerateIdx } from '@/components/steps/GenerateIdx';
import { Backtest } from '@/components/steps/Backtest';
import { Result } from '@/components/steps/Result';

export default function Home() {
  const [currentStep, setCurrentStep] = useState(1);

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <StockAnalysis />;
      case 2:
        return <VolumeAnalysis />;
      case 3:
        return <CandidateAnalysis />;
      case 4:
        return <FinancialAnalysis />;
      case 5:
        return <GenerateIdx />;
      case 6:
        return <Backtest />;
      case 7:
        return <Result />;
      default:
        return (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Coming soon...</p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar
        className="w-1/3"
        currentStep={currentStep}
        onStepChange={setCurrentStep}
      />
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-6xl mx-auto">
          {renderStepContent()}
        </div>
      </main>
    </div>
  );
}
