import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

const MANDATORY_CHECKS = [
  { id: 'vin_checked', label: 'Fahrgestellnummer (FIN) geprüft', instruction: 'Bitte prüfen Sie jetzt die Fahrgestellnummer am Fahrzeug.' },
  { id: 'odometer_correct', label: 'Kilometerstand korrekt erfasst', instruction: 'Bitte geben Sie den aktuellen Kilometerstand ein.' },
  { id: 'fuel_correct', label: 'Tankinhalt korrekt angegeben', instruction: 'Bitte wählen Sie den aktuellen Tankstand aus.' },
  { id: 'exterior_checked', label: 'Außenbereich des Fahrzeugs geprüft', instruction: 'Bitte kontrollieren Sie den Außenbereich des Fahrzeugs.' },
  { id: 'interior_checked', label: 'Innenraum geprüft', instruction: 'Bitte kontrollieren Sie den Innenraum des Fahrzeugs.' },
  { id: 'photos_complete', label: 'Alle vorgeschriebenen Fotos vollständig aufgenommen', instruction: 'Bitte fotografieren Sie das Fahrzeug gemäß der vorgegebenen Reihenfolge.' },
  { id: 'damages_checked', label: 'Fahrzeug auf Schäden kontrolliert', instruction: 'Bitte kontrollieren Sie das Fahrzeug auf Schäden und markieren Sie diese.' },
  { id: 'damages_documented', label: 'Alle vorhandenen Schäden dokumentiert', instruction: 'Bitte dokumentieren Sie alle gefundenen Schäden.' },
  { id: 'accessories_checked', label: 'Zubehör geprüft (Schlüssel, Bordunterlagen)', instruction: 'Bitte prüfen Sie Schlüssel, Bordunterlagen und weiteres Zubehör.' },
  { id: 'contact_correct', label: 'Kontaktdaten des Kunden korrekt', instruction: 'Bitte überprüfen Sie die Kontaktdaten des Kunden.' },
  { id: 'customer_informed', label: 'Kunde über Zustand informiert', instruction: 'Bitte informieren Sie den Kunden über den Fahrzeugzustand.' },
  { id: 'signatures_obtained', label: 'Unterschriften eingeholt', instruction: 'Bitte holen Sie die Unterschrift des Kunden ein.' },
];

export default function MandatoryChecklist({ checks = {}, onChange, onComplete }) {
  const [currentCheckIndex, setCurrentCheckIndex] = useState(0);
  
  const currentCheck = MANDATORY_CHECKS[currentCheckIndex];
  const answeredChecks = Object.keys(checks).length;
  const allAnswered = answeredChecks === MANDATORY_CHECKS.length;
  const allYes = MANDATORY_CHECKS.every(check => checks[check.id] === true);

  const handleAnswer = (answer) => {
    const newChecks = { ...checks, [currentCheck.id]: answer };
    onChange(newChecks);
    
    if (answer === false) {
      // Show warning for "No" answer
      alert(`Achtung: ${currentCheck.instruction}`);
    }
    
    // Move to next question
    if (currentCheckIndex < MANDATORY_CHECKS.length - 1) {
      setCurrentCheckIndex(currentCheckIndex + 1);
    } else if (Object.keys(newChecks).length === MANDATORY_CHECKS.length) {
      onComplete();
    }
  };

  const getCheckStatus = (checkId) => {
    if (checks[checkId] === true) return 'yes';
    if (checks[checkId] === false) return 'no';
    return 'pending';
  };

  return (
    <div className="space-y-4">
      {/* Current Question */}
      {!allAnswered && (
        <Card className="border-2 border-blue-500">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 text-blue-600 font-bold">
                  {currentCheckIndex + 1}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-gray-900 mb-2">
                    {currentCheck.label}
                  </h3>
                  <p className="text-gray-600 text-sm mb-4">
                    {currentCheck.instruction}
                  </p>
                  
                  <div className="flex gap-3">
                    <Button
                      onClick={() => handleAnswer(true)}
                      className="flex-1 py-6 text-lg bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle2 className="w-6 h-6 mr-2" />
                      JA
                    </Button>
                    <Button
                      onClick={() => handleAnswer(false)}
                      variant="outline"
                      className="flex-1 py-6 text-lg border-red-300 text-red-600 hover:bg-red-50"
                    >
                      <XCircle className="w-6 h-6 mr-2" />
                      NEIN
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress List */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">Prüfungs-Fortschritt</h4>
            <span className="text-sm text-gray-500">
              {answeredChecks} / {MANDATORY_CHECKS.length}
            </span>
          </div>
          
          <div className="space-y-2">
            {MANDATORY_CHECKS.map((check, index) => {
              const status = getCheckStatus(check.id);
              const isCurrent = index === currentCheckIndex;
              
              return (
                <div 
                  key={check.id}
                  className={`p-3 rounded-lg border flex items-start gap-3 ${
                    status === 'yes' ? 'bg-green-50 border-green-200' :
                    status === 'no' ? 'bg-red-50 border-red-200' :
                    isCurrent ? 'bg-blue-50 border-blue-200' :
                    'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {status === 'yes' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : status === 'no' ? (
                      <XCircle className="w-5 h-5 text-red-600" />
                    ) : isCurrent ? (
                      <AlertCircle className="w-5 h-5 text-blue-600" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      status === 'yes' ? 'text-green-900' :
                      status === 'no' ? 'text-red-900' :
                      isCurrent ? 'text-blue-900' :
                      'text-gray-600'
                    }`}>
                      {check.label}
                    </p>
                    {status === 'no' && (
                      <p className="text-xs text-red-600 mt-1">
                        ⚠️ Bitte beachten: {check.instruction}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {allAnswered && (
            <div className={`mt-4 p-4 rounded-lg ${allYes ? 'bg-green-100' : 'bg-yellow-100'}`}>
              <p className={`font-semibold text-center ${allYes ? 'text-green-800' : 'text-yellow-800'}`}>
                {allYes 
                  ? '✓ Alle Prüfungen bestätigt' 
                  : '⚠️ Einige Punkte wurden mit NEIN beantwortet'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}