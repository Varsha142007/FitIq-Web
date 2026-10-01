import { Navigate } from "react-router-dom";
import { auth } from "../../firebase/firebase";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

function ProtectedRoute({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      setRefreshError("");
      if (currentUser && !currentUser.emailVerified) {
        try {
          await currentUser.reload();
        } catch (error) {
          console.error("Unable to refresh Firebase verification status:", error);
          setUser(currentUser);
          setRefreshError(
            "We couldn't verify your account status. Check your connection and try again."
          );
          setLoading(false);
          return;
        }
      }
      setUser(auth.currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const retryVerificationRefresh = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setUser(null);
      setRefreshError("");
      return;
    }

    setLoading(true);
    setRefreshError("");
    try {
      await currentUser.reload();
      setUser(auth.currentUser);
    } catch (error) {
      console.error("Unable to refresh Firebase verification status:", error);
      setRefreshError(
        "We couldn't verify your account status. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-textSecondary text-sm font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (refreshError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2] px-4">
        <div className="max-w-md text-center">
          <p className="text-textPrimary font-semibold">{refreshError}</p>
          <button
            type="button"
            onClick={retryVerificationRefresh}
            className="mt-4 rounded-xl bg-primary px-5 py-2.5 text-white font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Block unverified users from accessing any protected application pages
  if (!user.emailVerified) {
    return (
      <Navigate
        to="/verify-email"
        replace
        state={{
          email: user.email,
          message: "Please verify your email before continuing."
        }}
      />
    );
  }

  return children;
}

export default ProtectedRoute;