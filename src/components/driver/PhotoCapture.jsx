import React, { useState } from 'react';
import { appClient } from '@/api/appClient';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Camera, 
  X, 
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

const PHOTO_TYPES = [
  { id: 'tacho', label: 'Tacho / Kilometerstand', required: true },
  { id: 'front', label: 'Front', required: true },
  { id: 'rear', label: 'Heck', required: true },
  { id: 'driver_side', label: 'Fahrerseite', required: true },
  { id: 'passenger_side', label: 'Beifahrerseite', required: true },
  { id: 'interior_front', label: 'Innenraum vorne', required: true },
  { id: 'interior_rear', label: 'Innenraum hinten', required: false },
  { id: 'trunk', label: 'Kofferraum', required: false },
  { id: 'headlights', label: 'Scheinwerfer', required: false },
  { id: 'damage', label: 'Schaden (optional)', required: false },
  { id: 'other', label: 'Sonstiges', required: false },
];

export default function PhotoCapture({ photos = [], onChange }) {
  const [uploading, setUploading] = useState({});

  const handleCapture = async (type, file) => {
    if (!file) return;
    
    setUploading(prev => ({ ...prev, [type]: true }));
    
    try {
      const { file_url } = await appClient.integrations.Core.UploadFile({ file });
      
      const newPhoto = {
        type,
        url: file_url,
        caption: PHOTO_TYPES.find(p => p.id === type)?.label || type
      };
      
      // Replace if exists, otherwise add
      const existingIndex = photos.findIndex(p => p.type === type);
      let newPhotos;
      if (existingIndex >= 0) {
        newPhotos = [...photos];
        newPhotos[existingIndex] = newPhoto;
      } else {
        newPhotos = [...photos, newPhoto];
      }
      
      onChange(newPhotos);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(prev => ({ ...prev, [type]: false }));
    }
  };

  const removePhoto = (type) => {
    onChange(photos.filter(p => p.type !== type));
  };

  const getPhotoByType = (type) => photos.find(p => p.type === type);

  const requiredPhotos = PHOTO_TYPES.filter(p => p.required);
  const optionalPhotos = PHOTO_TYPES.filter(p => !p.required);
  const completedRequired = requiredPhotos.filter(p => getPhotoByType(p.id)).length;

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
        <div className="relative w-12 h-12">
          <svg className="w-12 h-12 transform -rotate-90">
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="4"
            />
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="4"
              strokeDasharray={`${(completedRequired / requiredPhotos.length) * 126} 126`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-blue-600">
            {completedRequired}/{requiredPhotos.length}
          </span>
        </div>
        <div>
          <p className="font-medium text-blue-900">Pflichtfotos</p>
          <p className="text-sm text-blue-700">
            {completedRequired === requiredPhotos.length 
              ? 'Alle Pflichtfotos aufgenommen' 
              : `Noch ${requiredPhotos.length - completedRequired} Fotos erforderlich`
            }
          </p>
        </div>
      </div>

      {/* Required Photos */}
      <div>
        <h3 className="font-semibold mb-3">Pflichtfotos</h3>
        <div className="grid grid-cols-2 gap-3">
          {requiredPhotos.map((photoType) => {
            const photo = getPhotoByType(photoType.id);
            const isUploading = uploading[photoType.id];
            
            return (
              <Card key={photoType.id} className={photo ? 'border-green-300' : ''}>
                <CardContent className="p-3">
                  {photo ? (
                    <div className="relative">
                      <img 
                        src={photo.url} 
                        alt={photoType.label}
                        className="w-full aspect-video object-cover rounded"
                      />
                      <Button
                        size="icon"
                        variant="destructive"
                        className="absolute top-1 right-1 w-6 h-6"
                        onClick={() => removePhoto(photoType.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <div className="absolute bottom-1 left-1 bg-green-500 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        OK
                      </div>
                    </div>
                  ) : (
                    <label className={`flex flex-col items-center justify-center aspect-video bg-gray-50 rounded-lg border-2 border-dashed cursor-pointer hover:bg-gray-100 transition-colors ${isUploading ? 'border-blue-300' : 'border-gray-200'}`}>
                      {isUploading ? (
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                      ) : (
                        <Camera className="w-8 h-8 text-gray-400" />
                      )}
                      <span className="text-xs text-gray-500 mt-2 text-center px-2">
                        {photoType.label}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleCapture(photoType.id, e.target.files[0])}
                        disabled={isUploading}
                      />
                    </label>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Optional Photos */}
      <div>
        <h3 className="font-semibold mb-3">Weitere Fotos (optional)</h3>
        <div className="grid grid-cols-2 gap-3">
          {optionalPhotos.map((photoType) => {
            const photo = getPhotoByType(photoType.id);
            const isUploading = uploading[photoType.id];
            
            return (
              <Card key={photoType.id} className={photo ? 'border-green-300' : ''}>
                <CardContent className="p-3">
                  {photo ? (
                    <div className="relative">
                      <img 
                        src={photo.url} 
                        alt={photoType.label}
                        className="w-full aspect-video object-cover rounded"
                      />
                      <Button
                        size="icon"
                        variant="destructive"
                        className="absolute top-1 right-1 w-6 h-6"
                        onClick={() => removePhoto(photoType.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className={`flex flex-col items-center justify-center aspect-video bg-gray-50 rounded-lg border-2 border-dashed cursor-pointer hover:bg-gray-100 transition-colors ${isUploading ? 'border-blue-300' : 'border-gray-200'}`}>
                      {isUploading ? (
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                      ) : (
                        <Camera className="w-8 h-8 text-gray-400" />
                      )}
                      <span className="text-xs text-gray-500 mt-2 text-center px-2">
                        {photoType.label}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleCapture(photoType.id, e.target.files[0])}
                        disabled={isUploading}
                      />
                    </label>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}