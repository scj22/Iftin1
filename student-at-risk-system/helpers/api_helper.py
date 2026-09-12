from pydantic import BaseModel,Field
from typing import Optional,Literal

class StudentInputData(BaseModel):
    studytime: int
    failures: int
    schoolsup: Literal["yes", "no"]
    famsup: Literal["yes", "no"]
    activities: Literal["yes", "no"]
    higher: Literal["yes", "no"]
    internet: Literal["yes", "no"]

    famrel: int
    health: int
    absences: int

def get_student_prediction_result(prediction: int, propability: float):
    result= "At risk" if prediction == 1 else "Not at risk"
    prob_at_risk= round(propability[1],3)
    prob_not_at_risk= round(propability[0],3)
    prob_percentage= round(prob_at_risk*100,2) if result =="At risk" else round(prob_not_at_risk*100,2)
    return {
        "result": result,
        "probability": {
            "at_risk": prob_at_risk,
            "not_at_risk": prob_not_at_risk,
        },
        "model_percentage": prob_percentage,
        "human_required": True 
    }