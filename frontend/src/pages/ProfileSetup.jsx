import { useState, useEffect } from "react";
import { auth } from "../firebase/firebase";
import {
  updateUserProfile,
  getUserProfile
} from "../services/firestoreService";
import { useNavigate, useSearchParams } from "react-router-dom";
import { postBackend } from "../services/apiClient";
function ProfileSetup() {
const navigate = useNavigate();
const [searchParams] = useSearchParams();
const isEditMode = searchParams.get("edit") === "true";
  const [profile, setProfile] = useState({
    name: "",
    age: "",
    gender: "",
    height: "",
    weight: "",
    goal: "",
    activityLevel: "",
    dietPreference: ""
  });
useEffect(() => {

  async function loadProfile() {

    const user = auth.currentUser;

    if (!user) return;

    const data = await getUserProfile(user.uid);

    if (data) {

      setProfile({
        name: data.fullName || data.name || data.displayName || user.displayName || "",
        age: data.age ?? "",
        gender: data.gender ?? "",
        height: data.height ?? "",
        weight: data.weight ?? "",
        goal: data.goal ?? "",
        activityLevel: data.activityLevel ?? "",
        dietPreference: data.dietPreference ?? ""
      });

    }

  }

  loadProfile();

}, []);

 const handleChange = (e) => {
  const { name, value } = e.target;

  setProfile({
    ...profile,
    [name]: value,
  });
};

 const handleSubmit = async (e) => {
  e.preventDefault();

  try {
    const user = auth.currentUser;

    if (!user) {
      alert("No user logged in.");
      return;
    }

    if (profile.height < 50 || profile.height > 250) {
      alert("Height must be between 50 and 250 cm");
      return;
    }

    if (profile.weight < 20 || profile.weight > 300) {
      alert("Weight must be between 20 and 300 kg");
      return;
    }

    if (profile.age < 1 || profile.age > 120) {
      alert("Please enter a valid age");
      return;
    }

    if (
      !profile.gender ||
      !profile.goal ||
      !profile.activityLevel ||
      !profile.dietPreference
    ) {
      alert("Please complete all profile details.");
      return;
    }

    const trimmedName = profile.name ? profile.name.trim() : "";

    // Save profile data
    const profilePayload = {
      ...profile,
      ...(trimmedName ? { name: trimmedName, fullName: trimmedName } : {}),
      age: Number(profile.age),
      height: Number(profile.height),
      weight: Number(profile.weight),
    };

    await updateUserProfile(user.uid, profilePayload);

    // Sync Firebase Auth displayName if available
    if (trimmedName && user) {
      try {
        const { updateProfile } = await import("firebase/auth");
        await updateProfile(user, { displayName: trimmedName });
      } catch (authErr) {
        console.warn("Could not sync displayName:", authErr);
      }
    }

    // Edit Profile from Dashboard
    // Only update profile and return to Dashboard.
    if (isEditMode) {
      window.dispatchEvent(new CustomEvent("profileUpdated", { detail: profilePayload }));
      alert("Profile updated successfully! 🎉");
      navigate("/dashboard");
      return;
    }

    // New user: calculate body analysis
    const response = await postBackend(
      "/body-analysis",
      {
        age: Number(profile.age),
        gender: profile.gender,
        height: Number(profile.height),
        weight: Number(profile.weight),
        activityLevel: profile.activityLevel,
      }
    );

    // Save body analysis for new profile
    await updateUserProfile(user.uid, {
      bodyAnalysis: response.data,
    });

    alert("Profile saved successfully! 🎉");
    navigate("/health-assessment");

  } catch (error) {
    console.error("Profile save error:", error);
    alert(error.message);
  }
};

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">

      <div className="bg-white p-8 rounded-2xl shadow-card w-full max-w-md">

       <h1 className="text-3xl font-heading font-bold mb-6">
  {isEditMode ? "Edit Your Profile" : "Complete Your Profile"}
</h1>


        <form 
          onSubmit={handleSubmit}
          className="space-y-4"
        >
<label className="block mb-1 font-medium">
  Full Name
</label>
<input
  type="text"
  name="name"
  placeholder="Your Full Name"
  value={profile.name}
  onChange={handleChange}
  className="w-full border p-3 rounded"
/>

<label className="block mb-1 font-medium">
 Age
</label>
         <input
  type="number"
  name="age"
  min="1"
  max="120"
  value={profile.age}
  onChange={handleChange}
  className="w-full border p-3 rounded"
/>

<label className="block mb-1 font-medium">
  Height (cm)
</label>
         <input
  type="number"
  name="height"
  min="50"
  max="250"
  value={profile.height}
  onChange={handleChange}
  className="w-full border p-3 rounded"
/>
<label className="block mb-1 font-medium">
  Weight (kg)
</label>
        <input
  type="number"
  name="weight"
  min="20"
  max="300"
  value={profile.weight}
  onChange={handleChange}
  className="w-full border p-3 rounded"
/>


          <select
            name="gender"
            value={profile.gender}
            onChange={handleChange}
            className="w-full border p-3 rounded"
          >
            <option value="">Gender</option>
            <option>Male</option>
            <option>Female</option>
            <option>Other</option>
          </select>


          <select
            name="goal"
            value={profile.goal}
            onChange={handleChange}
            className="w-full border p-3 rounded"
          >
            <option value="">Fitness Goal</option>
            <option>Weight Loss</option>
            <option>Muscle Gain</option>
            <option>Maintain Fitness</option>
          </select>


          <select
            name="activityLevel"
            value={profile.activityLevel}
            onChange={handleChange}
            className="w-full border p-3 rounded"
          >
            <option value="">Activity Level</option>
            <option>Low</option>
            <option>Moderate</option>
            <option>High</option>
          </select>


          <select
            name="dietPreference"
            value={profile.dietPreference}
            onChange={handleChange}
            className="w-full border p-3 rounded"
          >
            <option value="">Diet Preference</option>
            <option>Vegetarian</option>
            <option>Non-Vegetarian</option>
            <option>Vegan</option>
          </select>


          <button
            className="w-full bg-primary text-white py-3 rounded-xl"
          >
  {isEditMode ? "Update Profile" : "Save Profile"}
</button>


        </form>

      </div>

    </div>
  );
}


export default ProfileSetup;