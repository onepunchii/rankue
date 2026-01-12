// src/pages/index.js
import AuthGate from "../components/AuthGate";
import { useAuth } from "../context/AuthContext";

export default function HomePage() {
  const { user, setUser } = useAuth();

  const fakeVerify = () => {
    setUser({ userType: "verified", nickname: "정환님" });
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>
        👋 안녕하세요, {user.userType === "guest" ? "게스트" : user.nickname}님
      </h2>

      <AuthGate>
        <p>✅ 이건 인증된 사람만 볼 수 있어요!</p>
      </AuthGate>

      {user.userType === "guest" && (
        <button onClick={fakeVerify}>👉 테스트용 인증 전환</button>
      )}
    </div>
  );
}
