import { useState, useEffect } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

interface LocationError {
  code: number;
  message: string;
}

export const useGeolocation = () => {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState<LocationError | null>(null);
  const [loading, setLoading] = useState(false);

  const getCurrentPosition = async (enableHighAccuracy = true): Promise<LocationData | null> => {
    setLoading(true);
    setError(null);

    try {
      if (Capacitor.isNativePlatform()) {
        // 네이티브 앱에서 권한 확인
        const permissions = await Geolocation.checkPermissions();
        
        if (permissions.location !== 'granted') {
          const requestResult = await Geolocation.requestPermissions();
          if (requestResult.location !== 'granted') {
            throw new Error('위치 권한이 거부되었습니다.');
          }
        }

        // 위치 정보 가져오기
        const coordinates = await Geolocation.getCurrentPosition({
          enableHighAccuracy,
          timeout: 10000,
          maximumAge: 3600000, // 1시간 캐시
        });

        const locationData: LocationData = {
          latitude: coordinates.coords.latitude,
          longitude: coordinates.coords.longitude,
          accuracy: coordinates.coords.accuracy,
          timestamp: coordinates.timestamp,
        };

        setLocation(locationData);
        setLoading(false);
        return locationData;
      } else {
        // 웹에서 브라우저 Geolocation API 사용
        return new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            const error = { code: 0, message: '위치 서비스가 지원되지 않습니다.' };
            setError(error);
            setLoading(false);
            reject(error);
            return;
          }

          navigator.geolocation.getCurrentPosition(
            (position) => {
              const locationData: LocationData = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: position.timestamp,
              };
              
              setLocation(locationData);
              setLoading(false);
              resolve(locationData);
            },
            (error) => {
              const locationError: LocationError = {
                code: error.code,
                message: getErrorMessage(error.code),
              };
              
              setError(locationError);
              setLoading(false);
              reject(locationError);
            },
            {
              enableHighAccuracy,
              timeout: 10000,
              maximumAge: 3600000,
            }
          );
        });
      }
    } catch (error: any) {
      const locationError: LocationError = {
        code: error.code || 0,
        message: error.message || '위치 정보를 가져올 수 없습니다.',
      };
      
      setError(locationError);
      setLoading(false);
      return null;
    }
  };

  const watchPosition = (callback: (location: LocationData) => void) => {
    if (Capacitor.isNativePlatform()) {
      // 네이티브 앱에서 위치 추적
      const watchId = Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 3600000,
        },
        (position) => {
          if (position) {
            const locationData: LocationData = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp,
            };
            
            setLocation(locationData);
            callback(locationData);
          }
        }
      );
      
      return () => {
        Geolocation.clearWatch({ id: watchId });
      };
    } else {
      // 웹에서 위치 추적
      if (!navigator.geolocation) {
        setError({ code: 0, message: '위치 서비스가 지원되지 않습니다.' });
        return () => {};
      }

      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const locationData: LocationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          };
          
          setLocation(locationData);
          callback(locationData);
        },
        (error) => {
          setError({
            code: error.code,
            message: getErrorMessage(error.code),
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 3600000,
        }
      );

      return () => {
        navigator.geolocation.clearWatch(watchId);
      };
    }
  };

  const getErrorMessage = (code: number): string => {
    switch (code) {
      case 1:
        return '위치 접근 권한이 거부되었습니다.';
      case 2:
        return '위치 정보를 사용할 수 없습니다.';
      case 3:
        return '위치 정보 요청 시간이 초과되었습니다.';
      default:
        return '위치 정보를 가져올 수 없습니다.';
    }
  };

  // 주소 역변환 (좌표 → 주소)
  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      // Kakao Maps API 사용 (실제 구현시 API 키 필요)
      const response = await fetch(
        `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`,
        {
          headers: {
            Authorization: 'KakaoAK YOUR_KAKAO_API_KEY', // 실제 API 키로 교체 필요
          },
        }
      );
      
      const data = await response.json();
      
      if (data.documents && data.documents.length > 0) {
        const address = data.documents[0].address;
        return `${address.region_1depth_name} ${address.region_2depth_name} ${address.region_3depth_name}`;
      }
      
      return '주소를 찾을 수 없습니다.';
    } catch (error) {
      console.error('주소 변환 실패:', error);
      return '주소 변환에 실패했습니다.';
    }
  };

  return {
    location,
    error,
    loading,
    getCurrentPosition,
    watchPosition,
    reverseGeocode,
  };
};