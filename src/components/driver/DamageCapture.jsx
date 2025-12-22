import React, { useState } from 'react';
import { appClient } from '@/api/appClient';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, Plus, X, Loader2, AlertTriangle } from 'lucide-react';

const VEHICLE_PARTS = [
  { id: 'front', label: 'Front' },
  { id: 'front_left', label: 'Front links' },
  { id: 'front_right', label: 'Front rechts' },
  { id: 'side_left', label: 'Linke Seite' },
  { id: 'side_right', label: 'Rechte Seite' },
  { id: 'rear', label: 'Heck' },
  { id: 'rear_left', label: 'Heck links' },
  { id: 'rear_right', label: 'Heck rechts' },
  { id: 'roof', label: 'Dach' },
  { id: 'windshield', label: 'Windschutzscheibe' },
  { id: 'interior', label: 'Innenraum' },
  { id: 'trunk', label: 'Kofferraum' },
  { id: 'wheels', label: 'Felgen' },
  { id: 'other', label: 'Sonstiges' },
];

const DAMAGE_TYPES = [
  { id: 'scratch', label: 'Kratzer' },
  { id: 'dent', label: 'Delle' },
  { id: 'damage', label: 'Beschädigung' },
  { id: 'other', label: 'Sonstiges' },
];

export default function DamageCapture({ damages = [], onChange, onComplete }) {
  const [hasDamages, setHasDamages] = useState(null);
  const [addingDamage, setAddingDamage] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [newDamage, setNewDamage] = useState({
    location: '',
    description: '',
    severity: 'minor',
    photo_url: ''
  });

  const handleStartDamageReport = (answer) => {
    setHasDamages(answer);
    if (answer === false) {
      onComplete();
    } else {
      setAddingDamage(true);
    }
  };

  const handlePhotoUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await appClient.integrations.Core.UploadFile({ file });
      setNewDamage(prev => ({ ...prev, photo_url: file_url }));
    } catch (error) {
      alert('Fehler beim Hochladen');
    } finally {
      setUploading(false);
    }
  };

  const handleAddDamage = () => {
    if (!newDamage.location || !newDamage.description || !newDamage.photo_url) {
      alert('Bitte alle Felder ausfüllen und Foto aufnehmen');
      return;
    }
    
    onChange([...damages, newDamage]);
    setNewDamage({ location: '', description: '', severity: 'minor', photo_url: '' });
    setAddingDamage(false);
  };

  const handleRemoveDamage = (index) => {
    onChange(damages.filter((_, i) => i !== index));
  };

  const handleFinish = () => {
    if (damages.length === 0 && hasDamages === true) {
      alert('Bitte mindestens einen Schaden dokumentieren');
      return;
    }
    onComplete();
  };

  // Initial question
  if (hasDamages === null) {
    return (
      <Card className="border-2 border-orange-500">
        <CardContent className="p-6 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 rounded-full">
            <AlertTriangle className="w-8 h-8 text-orange-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Schadenserfassung
            </h3>
            <p className="text-gray-600">
              Sind am Fahrzeug Schäden vorhanden?
            </p>
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={() => handleStartDamageReport(true)}
              className="flex-1 py-6 text-lg bg-orange-600 hover:bg-orange-700"
            >
              JA - Schäden vorhanden
            </Button>
            <Button
              onClick={() => handleStartDamageReport(false)}
              className="flex-1 py-6 text-lg bg-green-600 hover:bg-green-700"
            >
              NEIN - Keine Schäden
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add Damage Form */}
      {addingDamage && (
        <Card className="border-2 border-orange-500">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Neuer Schaden</h3>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setAddingDamage(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div>
              <Label>Position am Fahrzeug *</Label>
              <Select 
                value={newDamage.location} 
                onValueChange={(v) => setNewDamage({...newDamage, location: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Bitte wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_PARTS.map(part => (
                    <SelectItem key={part.id} value={part.id}>
                      {part.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Art des Schadens *</Label>
              <Select 
                value={newDamage.description} 
                onValueChange={(v) => setNewDamage({...newDamage, description: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Bitte wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {DAMAGE_TYPES.map(type => (
                    <SelectItem key={type.id} value={type.label}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Schweregrad</Label>
              <Select 
                value={newDamage.severity} 
                onValueChange={(v) => setNewDamage({...newDamage, severity: v})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minor">Leicht</SelectItem>
                  <SelectItem value="medium">Mittel</SelectItem>
                  <SelectItem value="severe">Schwer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Schadensfoto * (Pflicht)</Label>
              {newDamage.photo_url ? (
                <div className="relative">
                  <img 
                    src={newDamage.photo_url} 
                    alt="Schaden"
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute top-2 right-2"
                    onClick={() => setNewDamage({...newDamage, photo_url: ''})}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e.target.files[0])}
                    disabled={uploading}
                  />
                  <Button 
                    type="button"
                    variant="outline"
                    className="w-full py-8"
                    disabled={uploading}
                    onClick={(e) => e.currentTarget.previousElementSibling.click()}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Wird hochgeladen...
                      </>
                    ) : (
                      <>
                        <Camera className="w-5 h-5 mr-2" />
                        Schadensfoto aufnehmen
                      </>
                    )}
                  </Button>
                </label>
              )}
            </div>

            <Button 
              onClick={handleAddDamage}
              className="w-full bg-orange-600 hover:bg-orange-700"
            >
              Schaden hinzufügen
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Existing Damages */}
      {damages.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="font-semibold mb-3">Dokumentierte Schäden ({damages.length})</h4>
            <div className="space-y-3">
              {damages.map((damage, index) => (
                <div key={index} className="p-3 border rounded-lg relative">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2"
                    onClick={() => handleRemoveDamage(index)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  <div className="pr-8">
                    <p className="font-medium">
                      {VEHICLE_PARTS.find(p => p.id === damage.location)?.label || damage.location}
                    </p>
                    <p className="text-sm text-gray-600">{damage.description}</p>
                    <span className={`inline-block mt-1 text-xs px-2 py-1 rounded ${
                      damage.severity === 'severe' ? 'bg-red-100 text-red-800' :
                      damage.severity === 'medium' ? 'bg-orange-100 text-orange-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {damage.severity === 'severe' ? 'Schwer' :
                       damage.severity === 'medium' ? 'Mittel' : 'Leicht'}
                    </span>
                    {damage.photo_url && (
                      <img 
                        src={damage.photo_url} 
                        alt="Schaden"
                        className="w-full h-32 object-cover rounded mt-2"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {!addingDamage && (
        <div className="space-y-3">
          {hasDamages && (
            <Button 
              onClick={() => setAddingDamage(true)}
              variant="outline"
              className="w-full py-6 border-orange-300 text-orange-700"
            >
              <Plus className="w-5 h-5 mr-2" />
              Weiteren Schaden hinzufügen
            </Button>
          )}
          
          <Button 
            onClick={handleFinish}
            className="w-full py-6 bg-green-600 hover:bg-green-700"
          >
            Schadenserfassung abschließen
          </Button>
        </div>
      )}
    </div>
  );
}