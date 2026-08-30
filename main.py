from fastapi import *
from analyzer import *
from api_helper import *
from config import *



app = FastAPI(title="HR ASSISTANT")

@app.post("/analyze",response_model=AnalyzeResponse)
def analyze(data: AnalyzeRequest):
    analyzes =analyze_with_ollama(data.resume,data.job_description)
    overall_score= calculate_overall_score(analyzes.scores)
    match_level = get_match_level(overall_score=overall_score)
    return AnalyzeResponse(
        **analyzes.model_dump(),
        overall_score=overall_score,
        match_level=match_level,
        model_used=OLLAMA_MODEL
    )
