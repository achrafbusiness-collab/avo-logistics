import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, ArrowRight, ArrowLeft } from 'lucide-react';

const WIZARD_STEPS = [
  { id: 'vehicle_check', label: 'Fahrzeugdaten', icon: '🚗' },
  { id: 'photos', label: 'Fotos', icon: '📸' },
  { id: 'damages', label: 'Schäden', icon: '⚠️' },
  { id: 'checklist', label: 'Prüfungen', icon: '✓' },
  { id: 'signatures', label: 'Unterschriften', icon: '✍️' },
];

export default function ProtocolWizard({ 
  currentStep, 
  completedSteps = [], 
  onStepChange,
  children 
}) {
  const currentIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep);
  const progress = ((completedSteps.length) / WIZARD_STEPS.length) * 100;

  const canGoNext = completedSteps.includes(currentStep);
  const canGoBack = currentIndex > 0;

  const handleNext = () => {
    if (currentIndex < WIZARD_STEPS.length - 1) {
      onStepChange(WIZARD_STEPS[currentIndex + 1].id);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      onStepChange(WIZARD_STEPS[currentIndex - 1].id);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Progress Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">
              Schritt {currentIndex + 1} von {WIZARD_STEPS.length}
            </span>
            <span className="text-sm font-medium text-blue-600">
              {Math.round(progress)}%
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step Indicators */}
        <div className="flex items-center justify-between px-2 pb-3 overflow-x-auto">
          {WIZARD_STEPS.map((step, index) => (
            <div 
              key={step.id}
              className={`flex flex-col items-center min-w-[60px] ${
                index === currentIndex ? 'opacity-100' : 'opacity-40'
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg mb-1 ${
                completedSteps.includes(step.id) 
                  ? 'bg-green-100 text-green-700' 
                  : index === currentIndex
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-400'
              }`}>
                {completedSteps.includes(step.id) ? '✓' : step.icon}
              </div>
              <span className="text-xs font-medium text-center">{step.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {children}
      </div>

      {/* Navigation Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex gap-3">
        <Button 
          variant="outline" 
          onClick={handleBack}
          disabled={!canGoBack}
          className="flex-1"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück
        </Button>
        <Button 
          onClick={handleNext}
          disabled={!canGoNext || currentIndex === WIZARD_STEPS.length - 1}
          className="flex-1 bg-blue-600 hover:bg-blue-700"
        >
          Weiter
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}