import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase/firebase";
import {
  updateUserProfile,
  getUserProfile,
  addHealthHistory
} from "../services/firestoreService";
import { useLocation } from "react-router-dom";
import { postBackend } from "../services/apiClient";
function HealthAssessment() {
const navigate = useNavigate();
  const [step,setStep] = useState(1);
const location = useLocation();

const isUpdateMode =
  new URLSearchParams(location.search).get("update") === "true";

  const [healthData,setHealthData] = useState({

    sleepHours:"",
    waterIntake:"",
    dailySteps:"",
    exerciseFrequency:"",

    medicalConditions:"",
    smoking:"",
    alcohol:"",

    mealsPerDay:"",
    allergies:"",

    stressLevel:"",
    energyLevel:""

  });

useEffect(() => {

  async function loadAssessmentData(){

    if(!isUpdateMode) return;

    const user = auth.currentUser;

    if(!user) return;

    const profile = await getUserProfile(user.uid);

    if(profile){

     setHealthData({

  sleepHours: profile.healthAssessment?.sleepHours || "",
  waterIntake: profile.healthAssessment?.waterIntake || "",
  dailySteps: profile.healthAssessment?.dailySteps || "",
  exerciseFrequency: profile.healthAssessment?.exerciseFrequency || "",

  medicalConditions: profile.healthAssessment?.medicalConditions || "",
  smoking: profile.healthAssessment?.smoking || "",
  alcohol: profile.healthAssessment?.alcohol || "",

  mealsPerDay: profile.healthAssessment?.mealsPerDay || "",
  allergies: profile.healthAssessment?.allergies || "",

  stressLevel: profile.healthAssessment?.stressLevel || "",
  energyLevel: profile.healthAssessment?.energyLevel || ""

});

    }

  }

  loadAssessmentData();

}, [isUpdateMode]);

const handleChange = (e) => {
  const { name, value, type, min, max } = e.target;

  // Allow clearing the field
  if (value === "") {
    setHealthData({
      ...healthData,
      [name]: value,
    });
    return;
  }

  // Validate numeric inputs
  if (type === "number") {
    const num = Number(value);

    if (!isNaN(num)) {
      if (min !== "" && num < Number(min)) return;
      if (max !== "" && num > Number(max)) return;
    }
  }

  setHealthData({
    ...healthData,
    [name]: value,
  });
};
const validateStep = () => {

  if (step === 1) {

    if (
      !healthData.sleepHours ||
      !healthData.waterIntake ||
      !healthData.dailySteps ||
      !healthData.exerciseFrequency
    ) {
      alert("Please complete your lifestyle details.");
      return false;
    }

  }

  if (step === 2) {

    if (
      !healthData.smoking ||
      !healthData.alcohol
    ) {
      alert("Please complete your health details.");
      return false;
    }

  }

  if (step === 3) {

    if (
      !healthData.mealsPerDay ||
      !healthData.stressLevel ||
      !healthData.energyLevel
    ) {
      alert("Please complete your nutrition and wellness details.");
      return false;
    }

  }

  return true;
};

  return (

    <div className="min-h-screen flex items-center justify-center bg-background">

      <div className="bg-white p-8 rounded-2xl shadow-card w-full max-w-md">


        <h1 className="text-3xl font-heading font-bold mb-2">
          {isUpdateMode ? "Update Health Assessment" : "Complete Health Assessment"}
        </h1>


        <p className="mb-6">
          Step {step} of 3
        </p>
<div className="w-full bg-gray-200 rounded-full h-2 mb-6">
  <div
    className="bg-primary h-2 rounded-full transition-all duration-300"
    style={{ width: `${(step / 3) * 100}%` }}
  ></div>
</div>

        {
          step === 1 && (

            <div>

              <h2 className="text-xl font-bold mb-4">
                Lifestyle
              </h2>


              <input
  type="number"
  name="sleepHours"
  min="0"
  max="24"
  step="0.5"
  placeholder="Sleep hours/day"
  value={healthData.sleepHours}
  onChange={handleChange}
  className="w-full border p-3 rounded mb-3"
/>


              <input
              type="number"
              min="0"
              max="20"
              step="0.1"
              name="waterIntake"
              placeholder="Water intake (litres)"
              value={healthData.waterIntake}
              onChange={handleChange}
              className="w-full border p-3 rounded mb-3"
              />


              <input
              type="number"
              min="0"
              max="100000"
              name="dailySteps"
              placeholder="Daily steps"
              value={healthData.dailySteps}
              onChange={handleChange}
              className="w-full border p-3 rounded mb-3"
              />


              <input
              type="number"
              min="0"
              max="7"
              name="exerciseFrequency"
              placeholder="Exercise days/week"
              value={healthData.exerciseFrequency}
              onChange={handleChange}
              className="w-full border p-3 rounded mb-3"
              />


            </div>

          )
        }
{
  step === 2 && (

    <div>

      <h2 className="text-xl font-bold mb-4">
        Health
      </h2>


      <textarea
      name="medicalConditions"
      placeholder="Medical Conditions (optional)"
      value={healthData.medicalConditions}
      onChange={handleChange}
      className="w-full border p-3 rounded mb-3"
      />


      <select
      name="smoking"
      value={healthData.smoking}
      onChange={handleChange}
      className="w-full border p-3 rounded mb-3"
      >

        <option value="">
          Do you smoke?
        </option>

        <option>
          Yes
        </option>

        <option>
          No
        </option>

      </select>



      <select
      name="alcohol"
      value={healthData.alcohol}
      onChange={handleChange}
      className="w-full border p-3 rounded mb-3"
      >

        <option value="">
          Alcohol consumption
        </option>

        <option>
          Regular
        </option>

        <option>
          Occasionally
        </option>

        <option>
          Never
        </option>

      </select>


    </div>

  )
}
{
  step === 3 && (

    <div>

      <h2 className="text-xl font-bold mb-4">
        Nutrition & Wellness
      </h2>


      <input
      type="number"
      min="1"
      max="10"
      name="mealsPerDay"
      placeholder="Meals per day"
      value={healthData.mealsPerDay}
      onChange={handleChange}
      className="w-full border p-3 rounded mb-3"
      />


      <input
      name="allergies"
      placeholder="Food allergies (optional)"
      value={healthData.allergies}
      onChange={handleChange}
      className="w-full border p-3 rounded mb-3"
      />


      <label>
        Stress Level (1-5)
      </label>

      <input
  type="number"
  min="1"
  max="5"
  name="stressLevel"
  value={healthData.stressLevel}
  onChange={handleChange}
  className="w-full border p-3 rounded mb-3"
/>
 <label>
        Energy Level (1-5)
      </label>
<input
  type="number"
  min="1"
  max="5"
  name="energyLevel"
  value={healthData.energyLevel}
  onChange={handleChange}
  className="w-full border p-3 rounded mb-3"
/>


    </div>

  )
}
<div className="flex justify-between mt-6">

  {step > 1 && (
    <button
      type="button"
      onClick={() => setStep(step - 1)}
      className="bg-gray-300 px-6 py-3 rounded-xl"
    >
      Back
    </button>
  )}

  <button
    type="button"
    onClick={async() => {

      if (!validateStep()) return;

      if (step < 3) {
        setStep(step + 1);
      } else {

  try {

    const user = auth.currentUser;

    if (!user) {
      alert("No user logged in.");
      return;
    }
    const profile = await getUserProfile(user.uid);

if (!profile) {
  alert("Profile data not found.");
  return;
}
const analysisResponse = await postBackend(
  "/body-analysis",
  {
    age: Number(profile.age),
    gender: profile.gender,
    height: Number(profile.height),
    weight: Number(profile.weight),
    activityLevel: profile.activityLevel,

    sleepHours: Number(healthData.sleepHours),
    waterIntake: Number(healthData.waterIntake),
    dailySteps: Number(healthData.dailySteps),
    exerciseFrequency: Number(healthData.exerciseFrequency),
    stressLevel: Number(healthData.stressLevel)
  }
);
console.log(analysisResponse.data);

const bodyAnalysis = analysisResponse.data;

console.log(bodyAnalysis);

    await updateUserProfile(user.uid, {

  sleepHours: Number(healthData.sleepHours),
  waterIntake: Number(healthData.waterIntake),
  dailySteps: Number(healthData.dailySteps),
  exerciseFrequency: Number(healthData.exerciseFrequency),
  mealsPerDay: Number(healthData.mealsPerDay),
  stressLevel: Number(healthData.stressLevel),
  energyLevel: Number(healthData.energyLevel),

  healthAssessment: {
    ...healthData,
    sleepHours: Number(healthData.sleepHours),
    waterIntake: Number(healthData.waterIntake),
    dailySteps: Number(healthData.dailySteps),
    exerciseFrequency: Number(healthData.exerciseFrequency),
    mealsPerDay: Number(healthData.mealsPerDay),
    stressLevel: Number(healthData.stressLevel),
    energyLevel: Number(healthData.energyLevel)
  },

  bodyAnalysis,
  healthAssessmentCompleted: true

});
    console.log("Saving health history:", {
  sleepHours: Number(healthData.sleepHours),
  waterIntake: Number(healthData.waterIntake),
  dailySteps: Number(healthData.dailySteps),
  exerciseFrequency: Number(healthData.exerciseFrequency),
  mealsPerDay: Number(healthData.mealsPerDay),
  stressLevel: Number(healthData.stressLevel),
  energyLevel: Number(healthData.energyLevel),
  bmi: bodyAnalysis.bmi,
  healthScore: bodyAnalysis.healthScore
});
    await addHealthHistory(user.uid, {
  sleepHours: Number(healthData.sleepHours),
  waterIntake: Number(healthData.waterIntake),
  dailySteps: Number(healthData.dailySteps),
  exerciseFrequency: Number(healthData.exerciseFrequency),
  mealsPerDay: Number(healthData.mealsPerDay),
  stressLevel: Number(healthData.stressLevel),
  energyLevel: Number(healthData.energyLevel),

  bmi: bodyAnalysis.bmi,
  healthScore: bodyAnalysis.healthScore
});

    alert("Health Assessment Saved Successfully 🎉");

    navigate("/dashboard");

  }

  catch(error){

    alert(error.message);

  }

}

    }}
    className="bg-primary text-white px-6 py-3 rounded-xl ml-auto"
  >
    {step === 3 
  ? (isUpdateMode ? "Update Assessment" : "Complete Assessment") 
  : "Next"}
  </button>

</div>

      </div>

    </div>

  );

}


export default HealthAssessment;