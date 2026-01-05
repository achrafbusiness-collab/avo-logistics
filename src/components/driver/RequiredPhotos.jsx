import React, { useState } from 'react';
import { appClient } from '@/api/appClient';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, Check, Loader2, X } from 'lucide-react';

const REQUIRED_PHOTOS = [
  { id: 'odometer', label: 'Kilometerstand', instruction: 'Fotografieren Sie den Tachostand deutlich lesbar' },
  { id: 'door_driver', label: 'Fahrertür', instruction: 'Fotografieren Sie die Fahrertür' },
  { id: 'wheel_front_left', label: 'Felge vorne links', instruction: 'Fotografieren Sie die linke Vorderfelge' },
  { id: 'front_right', label: 'Front rechts', instruction: 'Fotografieren Sie die rechte Frontseite' },
  { id: 'front', label: 'Fahrzeug Front', instruction: 'Fotografieren Sie das Fahrzeug von vorne' },
  { id: 'front_left', label: 'Front links', instruction: 'Fotografieren Sie die linke Frontseite' },
  { id: 'wheel_front_right', label: 'Felge vorne rechts', instruction: 'Fotografieren Sie die rechte Vorderfelge' },
  { id: 'door_passenger', label: 'Beifahrertür', instruction: 'Fotografieren Sie die Beifahrertür' },
  { id: 'door_rear_right', label: 'Hintere Tür rechts', instruction: 'Fotografieren Sie die rechte hintere Tür' },
  { id: 'wheel_rear_right', label: 'Felge hinten rechts', instruction: 'Fotografieren Sie die rechte Hinterfelge' },
  { id: 'rear_right', label: 'Heck rechts', instruction: 'Fotografieren Sie die rechte Heckseite' },
  { id: 'rear', label: 'Fahrzeug hinten', instruction: 'Fotografieren Sie das Fahrzeug von hinten' },
  { id: 'trunk', label: 'Kofferraum', instruction: 'Fotografieren Sie den Kofferraum' },
  { id: 'rear_left', label: 'Heck links', instruction: 'Fotografieren Sie die linke Heckseite' },
  { id: 'wheel_rear_left', label: 'Felge hinten links', instruction: 'Fotografieren Sie die linke Hinterfelge' },
  { id: 'door_rear_left', label: 'Hintere Tür links', instruction: 'Fotografieren Sie die linke hintere Tür' },
  { id: 'windshield', label: 'Windschutzscheibe', instruction: 'Fotografieren Sie die Windschutzscheibe' },
  { id: 'interior_front', label: 'Innenraum vorne', instruction: 'Fotografieren Sie den vorderen Innenraum' },
  { id: 'interior_rear', label: 'Innenraum hinten', instruction: 'Fotografieren Sie den hinteren Innenraum' },
];

export default function RequiredPhotos({ photos = [], onChange, onComplete }) {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [uploading, setUploading] = useState(false);

  const currentPhoto = REQUIRED_PHOTOS[currentPhotoIndex];
  const takenPhotos = photos.filter(p => REQUIRED_PHOTOS.some(rp => rp.id === p.type));
  const isComplete = takenPhotos.length === REQUIRED_PHOTOS.length;

  const handlePhotoCapture = async (file) => {
    if (!file) return;
    
    setUploading(true);
    try {
      const { file_url } = await appClient.integrations.Core.UploadFile({ file });
      
      const newPhoto = {
        type: currentPhoto.id,
        url: file_url,
        caption: currentPhoto.label
      };
      
      const newPhotos = [...photos, newPhoto];
      onChange(newPhotos);
      
      // Auto-advance to next photo
      if (currentPhotoIndex < REQUIRED_PHOTOS.length - 1) {
        setCurrentPhotoIndex(currentPhotoIndex + 1);
      } else {
        onComplete();
      }
    } catch (error) {
      alert('Fehler beim Hochladen. Bitte erneut versuchen.');
    } finally {
      setUploading(false);
    }
  };

  const getPhotoByType = (type) => photos.find(p => p.type === type);

  return (
    <div className="space-y-4">
      {/* Current Photo Instruction */}
      {!isComplete && (
        <Card className="border-2 border-blue-500">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full">
                <Camera className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Foto {currentPhotoIndex + 1} / {REQUIRED_PHOTOS.length}
                </h3>
                <p className="text-2xl font-bold text-blue-600 mt-1">
                  {currentPhoto.label}
                </p>
                <p className="text-gray-600 mt-2">
                  {currentPhoto.instruction}
                </p>
              </div>
              
              <label className="block">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handlePhotoCapture(e.target.files[0])}
                  disabled={uploading}
                />
                <Button 
                  type="button"
                  className="w-full py-8 text-lg bg-blue-600 hover:bg-blue-700"
                  disabled={uploading}
                  onClick={(e) => e.currentTarget.previousElementSibling.click()}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                      Wird hochgeladen...
                    </>
                  ) : (
                    <>
                      <Camera className="w-6 h-6 mr-2" />
                      Foto aufnehmen
                    </>
                  )}
                </Button>
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress Grid */}
      <Card>
        <CardContent className="p-4">
          <h4 className="font-semibold mb-3">Foto-Fortschritt</h4>
          <div className="grid grid-cols-3 gap-2">
            {REQUIRED_PHOTOS.map((photo, index) => {
              const isTaken = getPhotoByType(photo.id);
              const isCurrent = index === currentPhotoIndex;
              
              return (
                <div 
                  key={photo.id}
                  className={`p-2 rounded-lg border text-center text-xs ${
                    isTaken 
                      ? 'bg-green-50 border-green-300' 
                      : isCurrent
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  {isTaken ? (
                    <Check className="w-4 h-4 mx-auto text-green-600 mb-1" />
                  ) : (
                    <Camera className={`w-4 h-4 mx-auto mb-1 ${isCurrent ? 'text-blue-600' : 'text-gray-400'}`} />
                  )}
                  <p className={isTaken ? 'text-green-700 font-medium' : isCurrent ? 'text-blue-700 font-medium' : 'text-gray-500'}>
                    {photo.label}
                  </p>
                </div>
              );
            })}
          </div>
          
          <div className="mt-4 p-3 bg-gray-100 rounded-lg text-center">
            <p className="font-semibold text-gray-900">
              {takenPhotos.length} / {REQUIRED_PHOTOS.length} Fotos aufgenommen
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Taken Photos Preview */}
      {takenPhotos.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="font-semibold mb-3">Aufgenommene Fotos</h4>
            <div className="grid grid-cols-3 gap-2">
              {takenPhotos.map((photo, index) => (
                <div key={index} className="relative aspect-square rounded-lg overflow-hidden border">
                  <img 
                    src={photo.url} 
                    alt={photo.caption}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 text-center">
                    {photo.caption}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
