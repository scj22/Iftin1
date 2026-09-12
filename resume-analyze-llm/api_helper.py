from pydantic import *
from typing import *

class AnalyzeRequest(BaseModel):
    resume: str =Field(min_length=50, description="resume")
    job_description: str = Field(min_length=50, description="job description")


class CategoryScoring(BaseModel):
    skills: int = Field(ge=0,le=40)
    experience: int = Field(ge=0,le=25)
    projects: int = Field(ge=0,le=15)
    education: int = Field(ge=0,le=10)
    resume_quality: int = Field(ge=0,le=10)


class ModelAnalyze(BaseModel):
    candidate_name: str | None = None
    professional_summary: str
    experience_years: float | None = None

    skills_found: list[str]
    matched_skills: list[str]
    missing_skills: list[str]

    strengths: list[str]
    concerns: list[str]
    evidence: list[str]

    scores: CategoryScoring


class AnalyzeResponse(ModelAnalyze):
    overall_score: int = Field(ge=0, le=100)
    match_level: Literal["High","Medium", "Low"]
    model_used: str



def calculate_overall_score(scores: CategoryScoring):
    return sum(
        [
            scores.skills,
            scores.experience,
            scores.projects,
            scores.education,
            scores.resume_quality
        ]
    )


def get_match_level(overall_score):
    if overall_score>=75:
        return "High"
    if overall_score>=50:
        return "Medium"
    return "Low"