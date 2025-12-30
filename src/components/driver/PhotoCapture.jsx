import React, { useEffect, useMemo, useRef, useState } from 'react';
import { appClient } from '@/api/appClient';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Camera, 
  X, 
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { useI18n } from '@/i18n';

const PHOTO_TYPES = [
  { id: 'front', labelKey: 'photos.types.front', required: true },
  { id: 'front_left', labelKey: 'photos.types.frontLeft', required: true },
  { id: 'front_right', labelKey: 'photos.types.frontRight', required: true },
  { id: 'wheel_front_right', labelKey: 'photos.types.wheelFrontRight', required: true },
  { id: 'door_passenger', labelKey: 'photos.types.doorPassenger', required: true },
  { id: 'door_rear_right', labelKey: 'photos.types.doorRearRight', required: true },
  { id: 'wheel_rear_right', labelKey: 'photos.types.wheelRearRight', required: true },
  { id: 'rear', labelKey: 'photos.types.rear', required: true },
  { id: 'rear_left', labelKey: 'photos.types.rearLeft', required: true },
  { id: 'wheel_rear_left', labelKey: 'photos.types.wheelRearLeft', required: true },
  { id: 'door_rear_left', labelKey: 'photos.types.doorRearLeft', required: true },
  { id: 'door_driver', labelKey: 'photos.types.doorDriver', required: true },
  { id: 'wheel_front_left', labelKey: 'photos.types.wheelFrontLeft', required: true },
  { id: 'windshield', labelKey: 'photos.types.windshield', required: true },
  { id: 'interior_front', labelKey: 'photos.types.interiorFront', required: true },
  { id: 'interior_rear', labelKey: 'photos.types.interiorRear', required: true },
  { id: 'trunk', labelKey: 'photos.types.trunk', required: true },
  { id: 'odometer', labelKey: 'photos.types.odometer', required: true },
  { id: 'damage', labelKey: 'photos.types.damage', required: false },
  { id: 'other', labelKey: 'photos.types.other', required: false },
];

export const REQUIRED_PHOTO_IDS = PHOTO_TYPES.filter((photo) => photo.required).map(
  (photo) => photo.id
);

export default function PhotoCapture({ photos = [], onChange, readOnly = false }) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState({});
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
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
        caption: t(PHOTO_TYPES.find(p => p.id === type)?.labelKey || "photos.types.other")
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
      setCameraError(error?.message || t('photos.errors.uploadFailed'));
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
    setCameraReady(false);
  };

  const startCamera = async () => {
    if (readOnly) return;
    setCameraError('');
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        const handleReady = () => setCameraReady(true);
        video.addEventListener('loadedmetadata', handleReady, { once: true });
        video.addEventListener('canplay', handleReady, { once: true });
        await video.play();
      }
      setCameraActive(true);
    } catch (err) {
      setCameraError(t('photos.errors.cameraStartFailed'));
    }
  };

  const ensureVideoReady = async () => {
    const video = videoRef.current;
    if (!video) return false;
    if (video.readyState >= 2 && video.videoWidth > 0) return true;
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2000);
      const onReady = () => {
        clearTimeout(timeout);
        resolve();
      };
      video.addEventListener('loadedmetadata', onReady, { once: true });
      video.addEventListener('canplay', onReady, { once: true });
    });
    return video.readyState >= 2 && video.videoWidth > 0;
  };

  const captureFromCamera = async () => {
    if (!videoRef.current || !currentType) return;
    setCapturing(true);
    try {
      const ready = await ensureVideoReady();
      if (!ready) {
        setCameraError(t('photos.errors.cameraNotReady'));
        return;
      }
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const width = video.videoWidth || video.clientWidth || 1280;
      const height = video.videoHeight || video.clientHeight || 720;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) {
        throw new Error(t('photos.errors.captureFailed'));
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
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">{t('photos.nextLabel')}</p>
                <p className="font-semibold text-slate-900">
                  {nextRequired ? t(nextRequired.labelKey) : t('photos.optionalTitle')}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={cameraActive ? stopCamera : startCamera}
              >
                {cameraActive ? t('photos.camera.stop') : t('photos.camera.start')}
              </Button>
            </div>

            {cameraError && (
              <div className="px-4 py-2 text-sm text-red-600">{cameraError}</div>
            )}

            {cameraActive && (
              <div className="relative">
                <div className="relative h-[60vh] bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute left-4 top-4 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
                    {currentType
                      ? t(PHOTO_TYPES.find((photo) => photo.id === currentType)?.labelKey || "photos.types.other")
                      : t("photos.camera.capture")}
                  </div>
                  {!cameraReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white">
                      {t('photos.camera.loading')}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 border-t bg-white px-4 py-3">
                  <div>
                    <p className="text-xs text-slate-500">{t('photos.captureType')}</p>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={currentType || ''}
                      onChange={(e) => setCurrentType(e.target.value)}
                    >
                      {nextRequired && <option value={nextRequired.id}>{t(nextRequired.labelKey)}</option>}
                      {requiredPhotos
                        .filter((photo) => photo.id !== nextRequired?.id)
                        .map((photo) => (
                          <option key={photo.id} value={photo.id}>
                            {t(photo.labelKey)}
                          </option>
                        ))}
                      {optionalPhotos.map((photo) => (
                        <option key={photo.id} value={photo.id}>
                          {t(photo.labelKey)} ({t('common.optional')})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      className="h-12 w-full text-base bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                      onClick={captureFromCamera}
                      disabled={capturing || !currentType || !cameraReady}
                    >
                      {capturing || uploading[currentType] ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Camera className="w-4 h-4 mr-2" />
                      )}
                      {t('photos.camera.capture')}
                    </Button>
                    <Button variant="outline" onClick={stopCamera}>
                      {t('photos.review')}
                    </Button>
                  </div>
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
          <p className="font-medium text-blue-900">{t('photos.requiredTitle')}</p>
          <p className="text-sm text-blue-700">
            {completedRequired === requiredPhotos.length
              ? t('photos.requiredComplete')
              : t('photos.requiredRemaining', { count: requiredPhotos.length - completedRequired })}
          </p>
        </div>
      </div>

      {/* Required Photos */}
      <div>
        <h3 className="font-semibold mb-3">{t('photos.requiredTitle')}</h3>
        <div className="grid grid-cols-2 gap-3">
          {requiredPhotos.map((photoType) => {
            const photo = getPhotoByType(photoType.id);
            const isUploading = uploading[photoType.id];
            const label = t(photoType.labelKey);
            
            return (
              <Card key={photoType.id} className={photo ? 'border-green-300' : ''}>
                <CardContent className="p-3">
                  {photo ? (
                    <div className="relative">
                      <img 
                        src={photo.url} 
                        alt={label}
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
                        {label}
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
                        {label}
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
        <h3 className="font-semibold mb-3">{t('photos.optionalTitle')}</h3>
        <div className="grid grid-cols-2 gap-3">
          {optionalPhotos.map((photoType) => {
            const photo = getPhotoByType(photoType.id);
            const isUploading = uploading[photoType.id];
            const label = t(photoType.labelKey);
            
            return (
              <Card key={photoType.id} className={photo ? 'border-green-300' : ''}>
                <CardContent className="p-3">
                  {photo ? (
                    <div className="relative">
                      <img 
                        src={photo.url} 
                        alt={label}
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
                        {label}
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
                        {label}
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
