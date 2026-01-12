// src/App.js
import { AuthProvider } from "./context/AuthContext";

function App() {
  return (
    <AuthProvider>
      <div>
        <h1>📊 Polli V2에 오신 걸 환영합니다!</h1>
      </div>
    </AuthProvider>
  );
}

export default App;
