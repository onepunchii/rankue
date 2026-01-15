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
  const [city, setCity] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);

  const getCurrentPosition = async (enableHighAccuracy = true): Promise<LocationData | null> => {
    setLoading(true);
    setError(null);

    try {
      if (Capacitor.isNativePlatform()) {
        const permissions = await Geolocation.checkPermissions();

        if (permissions.location !== 'granted') {
          const requestResult = await Geolocation.requestPermissions();
          if (requestResult.location !== 'granted') {
            throw new Error('위치 권한이 거부되었습니다.');
          }
        }

        const coordinates = await Geolocation.getCurrentPosition({
          enableHighAccuracy,
          timeout: 10000,
          maximumAge: 3600000,
        });

        const locationData: LocationData = {
          latitude: coordinates.coords.latitude,
          longitude: coordinates.coords.longitude,
          accuracy: coordinates.coords.accuracy,
          timestamp: coordinates.timestamp,
        };

        setLocation(locationData);
        // 좌표로 주소 변환 시도 (실제로는 API 키 필요하므로 여기서는 생략하거나 모의 처리)
        // await updateAddress(locationData.latitude, locationData.longitude);

        setLoading(false);
        return locationData;
      } else {
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
              // 좌표로 주소 변환 시도
              // updateAddress(locationData.latitude, locationData.longitude);

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

  // getCurrentAction alias
  const getCurrentLocation = getCurrentPosition;

  const watchPosition = (callback: (location: LocationData) => void) => {
    let watchId: string | number | undefined;

    const startWatch = async () => {
      if (Capacitor.isNativePlatform()) {
        watchId = await Geolocation.watchPosition(
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
      } else {
        if (!navigator.geolocation) {
          setError({ code: 0, message: '위치 서비스가 지원되지 않습니다.' });
          return;
        }

        watchId = navigator.geolocation.watchPosition(
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
      }
    };

    startWatch();

    return () => {
      if (watchId !== undefined) {
        if (Capacitor.isNativePlatform()) {
          Geolocation.clearWatch({ id: watchId as string });
        } else {
          navigator.geolocation.clearWatch(watchId as number);
        }
      }
    };
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

  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      // Mock implementation for now as API key is missing
      // In production, uncomment the fetch call below
      /*
      const response = await fetch(
        `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`,
        {
          headers: {
            Authorization: 'KakaoAK YOUR_KAKAO_API_KEY', 
          },
        }
      );
      
      const data = await response.json();
      
      if (data.documents && data.documents.length > 0) {
        const address = data.documents[0].address;
        const fullAddress = `${address.region_1depth_name} ${address.region_2depth_name} ${address.region_3depth_name}`;
        setCity(address.region_1depth_name);
        setDistrict(address.region_2depth_name);
        return fullAddress;
      }
      */

      // Dummy data for testing
      setCity("서울");
      setDistrict("중구");
      return "서울특별시 중구 (테스트)";
    } catch (error) {
      console.error('주소 변환 실패:', error);
      return '주소 변환에 실패했습니다.';
    }
  };

  return {
    location,
    latitude: location?.latitude,
    longitude: location?.longitude,
    city,
    district,
    error,
    loading,
    getCurrentPosition,
    getCurrentLocation,
    watchPosition,
    reverseGeocode,
  };
};