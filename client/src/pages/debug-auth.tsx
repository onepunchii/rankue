import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";

export default function DebugAuth() {
  const [authInfo, setAuthInfo] = useState<any>({});
  const [apiResponse, setApiResponse] = useState<any>(null);

  useEffect(() => {
    // localStorage에서 모든 auth 관련 정보 수집
    const guestId = localStorage.getItem('guestId');
    const isAuthenticated = localStorage.getItem('isAuthenticated');
    const guestUserId = localStorage.getItem('guestUserId');
    
    setAuthInfo({
      guestId,
      isAuthenticated,
      guestUserId,
      allLocalStorage: Object.keys(localStorage).reduce((acc: any, key) => {
        acc[key] = localStorage.getItem(key);
        return acc;
      }, {})
    });

    // API 호출 테스트
    if (guestId) {
      fetch('/api/user-state', {
        headers: { 'X-Auth-ID': guestId }
      })
        .then(res => res.json())
        .then(data => setApiResponse(data))
        .catch(err => setApiResponse({ error: err.message }));
    }
  }, []);

  const clearAuth = () => {
    localStorage.clear();
    window.location.reload();
  };

  const setCorrectAuth = () => {
    localStorage.setItem('guestId', 'guest_1752587167984_TW96aWxsYS81LjAgKE1hY2ludG8');
    localStorage.setItem('isAuthenticated', 'true');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <MobileHeader />
      
      <main className="max-w-md mx-auto px-4 py-6 pb-24">
        <h1 className="text-2xl font-bold mb-6">Auth Debug</h1>
        
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>LocalStorage 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs overflow-x-auto bg-gray-100 p-2 rounded">
              {JSON.stringify(authInfo, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle>API Response</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs overflow-x-auto bg-gray-100 p-2 rounded">
              {JSON.stringify(apiResponse, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Button 
            onClick={clearAuth} 
            className="w-full bg-red-600 hover:bg-red-700 text-white"
          >
            Clear All Auth
          </Button>
          <Button 
            onClick={setCorrectAuth} 
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            Set Correct Auth ID
          </Button>
        </div>
      </main>
      
      <BottomNav />
    </div>
  );
}