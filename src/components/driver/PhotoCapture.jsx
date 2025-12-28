import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  { id: 'front', label: 'Fahrzeug Front', required: true },
  { id: 'front_left', label: 'Front links', required: true },
  { id: 'front_right', label: 'Front rechts', required: true },
  { id: 'wheel_front_right', label: 'Felge vorne rechts', required: true },
  { id: 'door_passenger', label: 'Beifahrertür', required: true },
  { id: 'door_rear_right', label: 'Hintere Tür rechts', required: true },
  { id: 'wheel_rear_right', label: 'Felge hinten rechts', required: true },
  { id: 'rear', label: 'Fahrzeug hinten', required: true },
  { id: 'rear_left', label: 'Heck links', required: true },
  { id: 'wheel_rear_left', label: 'Felge hinten links', required: true },
  { id: 'door_rear_left', label: 'Hintere Tür links', required: true },
  { id: 'door_driver', label: 'Fahrertür', required: true },
  { id: 'wheel_front_left', label: 'Felge vorne links', required: true },
  { id: 'windshield', label: 'Windschutzscheibe', required: true },
  { id: 'interior_front', label: 'Innenraum vorne', required: true },
  { id: 'interior_rear', label: 'Innenraum hinten', required: true },
  { id: 'trunk', label: 'Kofferraum', required: true },
  { id: 'odometer', label: 'Kilometerstand', required: true },
  { id: 'damage', label: 'Schaden (optional)', required: false },
  { id: 'other', label: 'Sonstiges', required: false },
];

export const REQUIRED_PHOTO_IDS = PHOTO_TYPES.filter((photo) => photo.required).map(
  (photo) => photo.id
);

export default function PhotoCapture({ photos = [], onChange, readOnly = false }) {
  const [uploading, setUploading] = useState({});
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [currentType, setCurrentType] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const uploadPhoto = async (type, file) => {
    if (!file) return;
    
    setUploading(prev => ({ ...prev, [type]: true }));
    setCameraError('');
    
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
      setCameraError('Upload fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setUploading(prev => ({ ...prev, [type]: false }));
    }
  };

  const removePhoto = (type) => {
    onChange(photos.filter(p => p.type !== type));
  };

  const getPhotoByType = (type) => photos.find(p => p.type === type);

  const requiredPhotos = useMemo(() => PHOTO_TYPES.filter(p => p.required), []);
  const optionalPhotos = useMemo(() => PHOTO_TYPES.filter(p => !p.required), []);
  const completedRequired = requiredPhotos.filter(p => getPhotoByType(p.id)).length;
  const nextRequired = requiredPhotos.find((photo) => !getPhotoByType(photo.id)) || null;

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    if (readOnly) return;
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      setCameraError('Kamera konnte nicht gestartet werden.');
    }
  };

  const captureFromCamera = async () => {
    if (!videoRef.current || !currentType) return;
    setCapturing(true);
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) {
        throw new Error('Kein Foto aufgenommen.');
      }
      const file = new File([blob], `${currentType}-${Date.now()}.jpg`, { type: 'image/jpeg' });
      await uploadPhoto(currentType, file);
    } catch (err) {
      console.error('Capture failed:', err);
    } finally {
      setCapturing(false);
    }
  };

  useEffect(() => {
    if (!cameraActive) return;
    if (nextRequired?.id && currentType !== nextRequired.id) {
      setCurrentType(nextRequired.id);
      return;
    }
    if (!currentType && optionalPhotos[0]?.id) {
      setCurrentType(optionalPhotos[0].id);
    }
  }, [cameraActive, nextRequired, optionalPhotos, currentType]);

  useEffect(() => {
    if (readOnly) return;
    startCamera();
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      {!readOnly && (
        <Card className="border-slate-200">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">Nächstes Foto</p>
                <p className="font-semibold text-slate-900">
                  {nextRequired?.label || "Optionales Foto"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={cameraActive ? stopCamera : startCamera}
              >
                {cameraActive ? "Kamera schließen" : "Kamera starten"}
              </Button>
            </div>

            {cameraError && (
              <div className="text-sm text-red-600">{cameraError}</div>
            )}

            {cameraActive && (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-xl border bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="aspect-video w-full object-cover"
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <p className="text-xs text-slate-500">Aufnahme-Typ</p>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={currentType || ''}
                      onChange={(e) => setCurrentType(e.target.value)}
                    >
                      {nextRequired && <option value={nextRequired.id}>{nextRequired.label}</option>}
                      {requiredPhotos
                        .filter((photo) => photo.id !== nextRequired?.id)
                        .map((photo) => (
                          <option key={photo.id} value={photo.id}>
                            {photo.label}
                          </option>
                        ))}
                      {optionalPhotos.map((photo) => (
                        <option key={photo.id} value={photo.id}>
                          {photo.label} (optional)
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    className="flex-1 bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                    onClick={captureFromCamera}
                    disabled={capturing || !currentType}
                  >
                    {capturing || uploading[currentType] ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Camera className="w-4 h-4 mr-2" />
                    )}
                    Foto aufnehmen
                  </Button>
                </div>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </CardContent>
        </Card>
      )}
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
                      {!readOnly && (
                        <Button
                          size="icon"
                          variant="destructive"
                          className="absolute top-1 right-1 w-6 h-6"
                          onClick={() => removePhoto(photoType.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                      <div className="absolute bottom-1 left-1 bg-green-500 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        OK
                      </div>
                    </div>
                  ) : readOnly ? (
                    <div className="flex flex-col items-center justify-center aspect-video bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                      <Camera className="w-8 h-8 text-gray-300" />
                      <span className="text-xs text-gray-400 mt-2 text-center px-2">
                        {photoType.label}
                      </span>
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
                        onChange={(e) => uploadPhoto(photoType.id, e.target.files[0])}
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
                  ) : readOnly ? (
                    <div className="flex flex-col items-center justify-center aspect-video bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                      <Camera className="w-8 h-8 text-gray-300" />
                      <span className="text-xs text-gray-400 mt-2 text-center px-2">
                        {photoType.label}
                      </span>
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
                        onChange={(e) => uploadPhoto(photoType.id, e.target.files[0])}
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
