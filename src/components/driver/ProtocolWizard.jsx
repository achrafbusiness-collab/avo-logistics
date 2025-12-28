import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, ArrowRight, ArrowLeft } from 'lucide-react';
import { useI18n } from '@/i18n';

const WIZARD_STEPS = [
  { id: 'vehicle_check', labelKey: 'protocol.steps.basics', icon: '🚗' },
  { id: 'photos', labelKey: 'protocol.steps.photos', icon: '📸' },
  { id: 'signatures', labelKey: 'protocol.steps.signatures', icon: '✍️' },
];

export default function ProtocolWizard({ 
  currentStep, 
  completedSteps = [], 
  onStepChange,
  onBeforeNext,
  children 
}) {
  const { t } = useI18n();
  const currentIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep);
  const progress = ((completedSteps.length) / WIZARD_STEPS.length) * 100;

  const canGoNext = completedSteps.includes(currentStep);
  const canGoBack = currentIndex > 0;

  const handleNext = () => {
    if (currentIndex < WIZARD_STEPS.length - 1) {
      const nextStep = WIZARD_STEPS[currentIndex + 1].id;
      if (typeof onBeforeNext === "function") {
        const canProceed = onBeforeNext(currentStep, nextStep);
        if (!canProceed) return;
      }
      onStepChange(nextStep);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      onStepChange(WIZARD_STEPS[currentIndex - 1].id);
    }
  };

  return (
    <div className="min-h-screen bg-transparent pb-32">
      {/* Progress Header */}
      <div className="sticky top-0 z-10 bg-slate-950/85 border-b border-slate-800 backdrop-blur">
        <div className="mx-auto max-w-3xl p-4 text-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-300">
              {t('protocol.stepProgress', { current: currentIndex + 1, total: WIZARD_STEPS.length })}
            </span>
            <span className="text-sm font-medium text-blue-200">
              {Math.round(progress)}%
            </span>
          </div>
          <Progress value={progress} className="h-2 bg-slate-800" />
        </div>

        {/* Step Indicators */}
        <div className="mx-auto max-w-3xl flex items-center justify-between px-2 pb-3 overflow-x-auto text-slate-200">
          {WIZARD_STEPS.map((step, index) => (
            <div 
              key={step.id}
              className={`flex flex-col items-center min-w-[60px] ${
                index === currentIndex ? 'opacity-100' : 'opacity-40'
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg mb-1 ${
                completedSteps.includes(step.id) 
                  ? 'bg-emerald-500/20 text-emerald-200' 
                  : index === currentIndex
                  ? 'bg-blue-500/20 text-blue-200'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                {completedSteps.includes(step.id) ? '✓' : step.icon}
              </div>
              <span className="text-xs font-medium text-center">{t(step.labelKey)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="mx-auto max-w-3xl rounded-3xl bg-gradient-to-br from-white via-slate-50 to-blue-50/80 p-4 shadow-[0_25px_45px_-35px_rgba(15,23,42,0.8)]">
          {children}
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 border-t border-slate-200 p-4 backdrop-blur">
        <div className="mx-auto max-w-3xl flex gap-3">
          <Button 
            variant="outline" 
            onClick={handleBack}
            disabled={!canGoBack}
            className="flex-1"
          >
            <ArrowLeft className="w-4 h-4 mr-2 rtl-flip" />
            {t('common.back')}
          </Button>
          <Button 
            onClick={handleNext}
            disabled={!canGoNext || currentIndex === WIZARD_STEPS.length - 1}
            className="flex-1 bg-[#1e3a5f] hover:bg-[#2d5a8a]"
          >
            {t('common.next')}
            <ArrowRight className="w-4 h-4 ml-2 rtl-flip" />
          </Button>
        </div>
      </div>
    </div>
  );
}
