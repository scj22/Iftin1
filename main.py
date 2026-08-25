from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import joblib
import pandas as pd
from helpers.api_helper import StudentInputData,get_student_prediction_result


model = joblib.load("student-at-risk-model.joblib")
app = FastAPI(
    title="Student At Risk System",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get('/')
def home():
    return FileResponse("index.html")


@app.post("/predict")
def predict_student_at_risk(student_data: StudentInputData):
    data_frame = pd.DataFrame([student_data.model_dump()])
    prediction = model.predict(data_frame)[0]
    prob = model.predict_proba(data_frame)[0]
    result = get_student_prediction_result(prediction, prob)
    return result