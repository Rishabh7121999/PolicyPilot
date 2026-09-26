from fastapi import APIRouter

from backend.schemas import ChatRequest, ChatResponse
from chains.clarification_chain import clarification_chain
from core.insurance_bot import ask_insurance_bot

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    if request.policy_id is None:
        clarification = clarification_chain.invoke({"question": request.message})

        if clarification.get("needs_clarification"):
            return ChatResponse(
                answer=clarification["clarification_question"],
                needs_clarification=True,
                clarification_question=clarification["clarification_question"],
            )

    result = ask_insurance_bot(request.message, request.history, request.policy_id)

    return ChatResponse(
        answer=result["answer"],
        sources=result["sources"],
        policy_type=result["policy_type"],
        timings=result["timings"],
    )
