from typing import Literal

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

# Replaces the old clarification_chain + policy_detector pair for the
# unscoped chat surfaces (no policy_id already in hand). One structured-output
# call does all of:
#   1. rewrites the question into a standalone, search-ready query (folding in
#      chat history, so follow-ups like "and the waiting period for that?"
#      aren't sent to retrieval verbatim),
#   2. classifies which policy type the question is about,
#   3. resolves it to a single one of the user's actual policy rows when that's
#      unambiguous, and
#   4. asks a clarifying question -- grounded in the user's real policy list,
#      not a generic "health, life, or motor?" -- only when it truly can't be
#      narrowed down.


class PolicyResolution(BaseModel):
    standalone_question: str = Field(
        description=(
            "The user's question rewritten as a single, self-contained search query. "
            "Resolve pronouns/references from chat history (e.g. 'that', 'it', 'the same policy') "
            "into explicit terms, and expand abbreviations, medical terms, and insurance "
            "terminology (e.g. 'ACL' -> 'anterior cruciate ligament (ACL) reconstruction surgery'). "
            "If the question is already clear and self-contained, keep it close to the original."
        )
    )
    policy_type: Literal["health", "life", "motor", "both", "unknown"] = Field(
        description=(
            "Which policy type the question is about. 'both' for questions that explicitly "
            "compare policies or ask about everything at once. 'unknown' for questions that "
            "aren't about a specific policy type (e.g. small talk, or genuinely ambiguous "
            "questions like 'what is my premium?' with no other context)."
        )
    )
    resolved_policy_id: int | None = Field(
        default=None,
        description=(
            "The single policy id (from the provided policy list) this question is about, if it "
            "can be determined unambiguously -- e.g. the user has exactly one policy of the "
            "relevant type, or a prior turn in the chat history already established which one. "
            "null if it can't be narrowed to one specific policy (including when policy_type is "
            "'both' or 'unknown', or the user has zero policies of that type)."
        ),
    )
    needs_clarification: bool = Field(
        description=(
            "True only if the question is about a specific policy type but the user has MORE "
            "THAN ONE policy of that type and nothing in the chat history narrows it down -- so "
            "resolved_policy_id could not be set and retrieval would otherwise mix up two "
            "different policies. False whenever resolved_policy_id is set, policy_type is "
            "'both'/'unknown', or the user has zero/one policy of that type."
        )
    )
    clarification_question: str | None = Field(
        default=None,
        description=(
            "A short natural question asking the user which policy they mean, mentioning the "
            "candidates by insurer/product name (e.g. 'Did you mean your Star Health "
            "Comprehensive policy or your HDFC Ergo policy?'). Required when needs_clarification "
            "is true, otherwise null."
        ),
    )


llm = ChatGoogleGenerativeAI(
    model="gemini-3.1-flash-lite",
    temperature=0,
    timeout=20,
    max_retries=2,
    max_output_tokens=300,
)

structured_llm = llm.with_structured_output(PolicyResolution)

prompt = ChatPromptTemplate.from_template("""
You are an insurance assistant's query-understanding step.

The user's uploaded policies:
{policies}

Chat History:
{history}

User Question:
{question}

Resolve which policy (if any) this question is about, and rewrite the question into a standalone
search query, following the field descriptions exactly.
""")

_chain = prompt | structured_llm


def _format_policies(policies: list[dict]) -> str:
    if not policies:
        return "(none uploaded yet)"

    lines = []

    for p in policies:
        label = f"id={p['id']} | type={p['policy_type']}"

        if p.get("insurer"):
            label += f" | insurer={p['insurer']}"

        if p.get("product_name"):
            label += f" | product={p['product_name']}"

        lines.append(label)

    return "\n".join(lines)


def resolve_policy(question: str, history: list[str], policies: list[dict]) -> PolicyResolution:
    return _chain.invoke({
        "question": question,
        "history": "\n".join(history) if history else "(none)",
        "policies": _format_policies(policies),
    })
