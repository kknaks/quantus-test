import { cn } from "@/lib/utils"

interface Step {
  id: number;
  title: string;
  description: string;
}

const steps: Step[] = [
  {
    id: 1,
    title: "Step 1. 주식 데이터 수집",
    description: "주식 데이터를 수집하고 필터링 합니다."
  },
  {
    id: 2,
    title: "Step 2. 거래량 분석 & 필터링",
    description: "수집된 데이터의 거래량의 통계를 구합니다."
  },
  {
    id: 3,
    title: "Step 3. 종목 후보군 선정",
    description: "필터링한 데이터 중 분석할 종목을 선정합니다."
  },
  {
    id: 4,
    title: "Step 4. 재무제표 수집 & 필터링",
    description: "후보군의 재무제표를 수집하고 필터링 합니다."
  },
  {
    id: 5,
    title: "Step 5. 투자지표 생성 & 분석",
    description: "주요 지표를 생성하고 분석 합니다."
  },
  {
    id: 6,
    title: "Step 6. 백테스트 진행",
    description: "설정한 지표로 백테스트를 수행합니다."
  },
  {
    id: 7,
    title: "Step 7. 결과 확인",
    description: "백테스트 결과를 확인합니다. "
  },
]

interface SidebarProps {
  currentStep: number;
  onStepChange: (step: number) => void;
  className?: string;
}

export function Sidebar({ currentStep, onStepChange, className }: SidebarProps) {
  return (
    <div className={cn("h-screen bg-gray-100 p-4", className)}>
      <div className="space-y-4">
        <h2 className="text-xl font-bold mb-6">Analysis Steps</h2>
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              "p-4 rounded-lg cursor-pointer transition-colors",
              currentStep === step.id
                ? "bg-black text-white"
                : "bg-white hover:bg-gray-50"
            )}
            onClick={() => onStepChange(step.id)}
          >
            <h3 className="font-medium">{step.title}</h3>
            <p className={cn(
              "text-sm mt-1",
              currentStep === step.id ? "text-white-100" : "text-gray-500"
            )}>{step.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
} 