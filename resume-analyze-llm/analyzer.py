from ollama import *
from api_helper import *
from config import *
from prompt import *

client= Client(host=OLLAMA_HOST)


def analyze_with_ollama(resume,job_description):
    prompt = build_prompt(resume,job_description)
    response= client.chat(
        model= OLLAMA_MODEL,
        messages=[
            {"role":"system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        format=ModelAnalyze.model_json_schema(),
        options={
            "temperature": 0.0,
        }

    )

    return ModelAnalyze.model_validate_json(
        response.message.content
    )
