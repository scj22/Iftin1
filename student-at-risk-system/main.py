from fastapi import FastAPI 
import joblib
import pandas as pd
from helpers.api_helper import StudentInputData,get_student_prediction_result


model = joblib.load("student-at-risk-model.joblib")
app = FastAPI(
    title="Student At Risk System",
    version="1.0.0"
)

@app.get('/')
def home():
    return {"message": "Welcome to the Student At Risk System API!"}


@app.post("/predict")
def predict_student_at_risk(student_data: StudentInputData):
    data_frame = pd.DataFrame([student_data.model_dump()])
    prediction = model.predict(data_frame)[0]
    prob = model.predict_proba(data_frame)[0]
    result = get_student_prediction_result(prediction, prob)
    return result