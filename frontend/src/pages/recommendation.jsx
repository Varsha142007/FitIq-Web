import { useEffect, useState } from "react";
import { getComprehensiveInterpretation } from "../services/interpretationService";
import { getUserProfile, getWeeklyTracking, getDailyTracking } from "../services/firestoreService";
import { auth } from "../firebase/firebase";

function Recommendation({ actions, externalLoading, externalError }) {
  const [localRecommendations, setLocalRecommendations] = useState([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [localError, setLocalError] = useState("");

  const useExternal = actions !== undefined;

  useEffect(() => {
    if (useExternal) return;

    async function loadRecommendations() {
      try {
        const user = auth.currentUser;
        if (!user) {
          setLocalError("Please log in to view your recommendations.");
          return;
        }

        const data = await getUserProfile(user.uid);
        if (!data) {
          setLocalError("Your profile is not available yet.");
          return;
        }

        const todayTracking = await getDailyTracking(user.uid);
        const history = await getWeeklyTracking(user.uid);

        const getRecordMillis = (r) => {
          if (!r) return 0;
          const raw = r.completedAt || r.recordedAt || r.completedAtMillis || r.createdAt || r.timestamp;
          if (raw?.toMillis) return raw.toMillis();
          if (typeof raw === "number") return raw;
          if (raw?.seconds) return raw.seconds * 1000;
          if (r.date) {
            const p = new Date(`${r.date}T00:00:00`).getTime();
            if (!isNaN(p)) return p;
          }
          return 0;
        };

        const validHistory = [...(history || [])].sort((a, b) => getRecordMillis(a) - getRecordMillis(b));
        const totalCount = validHistory.length;
        const latestDoc = totalCount > 0 ? validHistory[totalCount - 1] : todayTracking;
        const previousDoc = totalCount > 1 ? validHistory[totalCount - 2] : null;

        // We fetch the comprehensive interpretation using verified latest checkin data
        const interpretData = await getComprehensiveInterpretation({
          profile: data,
          today_checkin: latestDoc || todayTracking || null,
          latest_checkin: latestDoc || todayTracking || null,
          previous_checkin: previousDoc,
          checkin_count: totalCount,
          is_first_checkin: totalCount <= 1,
          recent_history: validHistory,
          cache_key: `${user.uid}_${getRecordMillis(latestDoc) || Date.now()}`,
        });

        setLocalRecommendations(interpretData?.user_mode || null);
      } catch (err) {
        console.error("Recommendation request failed:", err);
        setLocalError("Recommendations are temporarily unavailable.");
      } finally {
        setLocalLoading(false);
      }
    }

    loadRecommendations();

    const handleUpdate = () => {
      loadRecommendations();
    };
    window.addEventListener("dailyTrackingUpdated", handleUpdate);
    return () => {
      window.removeEventListener("dailyTrackingUpdated", handleUpdate);
    };
  }, [useExternal]);

  const isLoading = useExternal ? externalLoading : localLoading;
  const isError = useExternal ? externalError : localError;
  const displayData = useExternal ? actions : localRecommendations;

  if (isLoading) {
    return (
      <div className="rounded-xl bg-orange-50 p-4 text-sm text-gray-600">
        Generating your personalized recommendations…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl bg-orange-50 p-4 text-sm text-gray-600">
        {isError}
      </div>
    );
  }

  if (!displayData) {
    return (
      <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
        No new recommendations are available right now.
      </div>
    );
  }

  // If used externally (e.g. Dashboard), displayData might just be the priority_actions array
  const isArray = Array.isArray(displayData);
  const userMode = isArray ? null : displayData;
  const priorityActions = isArray ? displayData : userMode?.priority_actions;

  return (
    <div className="space-y-6">
      {!isArray && userMode && (
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-2">AI Health Summary</h2>
          <p className="text-gray-700 whitespace-pre-line">{userMode.overall_summary}</p>
          
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-green-700">Strengths</h3>
              <ul className="list-disc pl-5 mt-1 text-sm text-gray-600">
                {userMode.strengths?.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-red-700">Needs Attention</h3>
              <ul className="list-disc pl-5 mt-1 text-sm text-gray-600">
                {userMode.what_needs_attention?.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {priorityActions && priorityActions.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-3">Priority Actions</h3>
          <div className="space-y-4">
            {priorityActions.map((item, index) => {
              if (typeof item === 'object' && item !== null) {
                return (
                  <div key={index} className="flex gap-4 p-4 rounded-xl border border-orange-100 bg-orange-50/40">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-white font-bold flex items-center justify-center text-sm">
                      {item.priority || index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-bold text-textPrimary text-sm">{item.title || item.action}</p>
                        {item.since_last_checkin && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <span className="text-[10px] uppercase font-bold text-blue-500">Since last check-in:</span>
                            <span>{item.since_last_checkin}</span>
                          </span>
                        )}
                      </div>
                      {item.what_is_happening && (
                        <p className="text-sm text-gray-700 mt-2"><strong>What's happening:</strong> {item.what_is_happening}</p>
                      )}
                      {item.why_it_matters && (
                        <p className="text-sm text-amber-700 mt-1"><strong>Why it matters:</strong> {item.why_it_matters}</p>
                      )}
                      {item.what_to_do_next && (
                        <p className="text-sm text-green-700 mt-1"><strong>What to do next:</strong> {item.what_to_do_next}</p>
                      )}
                      {item.evidence && (
                        <p className="text-xs text-primary mt-3 font-medium">Why FitIQ recommends this: {item.evidence}</p>
                      )}
                    </div>
                  </div>
                );
              }
              
              return (
                <div key={`${index}-${item}`} className="rounded-xl border border-orange-100 bg-orange-50/60 p-4">
                  <div className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-white text-sm font-bold">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-relaxed text-gray-700">{item}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isArray && userMode?.nutrition && (
        <div className="bg-white rounded-2xl shadow-card p-6 border border-gray-100 mt-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><span>🍎</span> Personalized Nutrition</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(userMode.nutrition).map(([meal, plan]) => (
              <div key={meal} className="bg-orange-50 rounded-xl p-4 shadow-sm border border-orange-100">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold capitalize text-primary">{meal}</h3>
                  {typeof plan === "object" && plan?.time && (
                    <span className="text-xs font-semibold px-2 py-1 bg-white text-orange-600 rounded-full border border-orange-200">
                      {plan.time}
                    </span>
                  )}
                </div>
                {typeof plan === "object" ? (
                  <p className="text-sm text-gray-700 leading-relaxed">{plan.meal || plan.explanation || JSON.stringify(plan)}</p>
                ) : (
                  <p className="text-sm text-gray-700 leading-relaxed">{plan}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Recommendation;
